import "server-only"

import { createHash } from "node:crypto"
import { z } from "zod"
import type { LLMTool } from "@/lib/llm/provider"
import type { KnowledgeChunk } from "./knowledge"

// ─── Tool signal ──────────────────────────────────────────────────────────────
// Signals that change engine loop flow after a tool executes.

export type ToolSignal = "transfer" | "end"

// ─── Tool result ──────────────────────────────────────────────────────────────

export type ToolResult =
  | { success: true; data: Record<string, unknown>; signal?: ToolSignal }
  | { success: false; error: string }

// ─── Tool context ─────────────────────────────────────────────────────────────
// All IDs come from the server context (episode, conversation, lead).
// The AI model never supplies orgId, leadId, or conversationId.

export interface ToolContext {
  orgId: string
  leadId: string | null
  episodeId: string
  conversationId: string
  knowledgeChunks: KnowledgeChunk[]
  sandbox: boolean // true = simulator — no real DB writes
  queueItemId?: string // set by cron worker; enables stable idempotency keys
  toolCallIndex?: number // monotonically incremented per tool call in this engine run
}

// ─── Idempotency ──────────────────────────────────────────────────────────────
// Stable per-call key: SHA-256("tool:" + queueItemId + ":" + toolName + ":" + callIndex)
// Uses INSERT … ON CONFLICT DO NOTHING to claim the execution slot atomically.
// If the slot is already claimed (from a prior retry), the tool is skipped.

function computeOperationKey(queueItemId: string, toolName: string, callIndex: number): string {
  return createHash("sha256")
    .update(`tool:${queueItemId}:${toolName}:${callIndex}`)
    .digest("hex")
}

async function claimExecution(
  ctx: ToolContext,
  toolName: string,
  input: Record<string, unknown>
): Promise<{ claimed: true; recordId: string } | { claimed: false }> {
  if (ctx.sandbox || !ctx.queueItemId) {
    // Sandbox or no queue context: idempotency is not applicable
    return { claimed: true, recordId: "" }
  }

  const key = computeOperationKey(ctx.queueItemId, toolName, ctx.toolCallIndex ?? 0)

  const { db } = await import("@/lib/db")
  const { aiToolExecutions } = await import("@/lib/db/schema")

  const rows = await db
    .insert(aiToolExecutions)
    .values({
      orgId: ctx.orgId,
      episodeId: ctx.episodeId,
      conversationId: ctx.conversationId,
      toolName,
      input,
      status: "pending",
      idempotencyKey: key,
    })
    .onConflictDoNothing()
    .returning({ id: aiToolExecutions.id })

  if (rows.length === 0) {
    // Conflict: this tool call was already executed on a prior attempt
    return { claimed: false }
  }

  return { claimed: true, recordId: rows[0]!.id }
}

async function completeExecution(
  recordId: string,
  orgId: string,
  result: ToolResult,
  durationMs: number
): Promise<void> {
  if (!recordId) return // sandbox — no record to update

  const { db } = await import("@/lib/db")
  const { aiToolExecutions } = await import("@/lib/db/schema")
  const { eq, and } = await import("drizzle-orm")

  await db
    .update(aiToolExecutions)
    .set({
      output: result.success ? result.data : null,
      status: result.success ? "success" : "error",
      errorDetail: result.success ? null : (result.error ?? "").slice(0, 500) || null,
      durationMs,
    })
    .where(and(eq(aiToolExecutions.id, recordId), eq(aiToolExecutions.orgId, orgId)))
}

// Claim → execute → complete. Idempotent: if already claimed, returns a noop success.
async function withIdempotency(
  ctx: ToolContext,
  toolName: string,
  input: Record<string, unknown>,
  fn: () => Promise<ToolResult>
): Promise<ToolResult> {
  const claim = await claimExecution(ctx, toolName, input)

  if (!claim.claimed) {
    return { success: true, data: { idempotent: true, note: "already_executed_on_prior_attempt" } }
  }

  const start = Date.now()
  let result: ToolResult

  try {
    result = await fn()
  } catch {
    result = { success: false, error: "Tool execution failed" }
  }

  await completeExecution(claim.recordId, ctx.orgId, result, Date.now() - start).catch(() => undefined)
  return result
}

// ─── Input validators ─────────────────────────────────────────────────────────

const StageEnum = z.enum(["new", "contacted", "interested", "quoted", "won", "lost"])

// ─── Tool definitions (JSON schema for the LLM) ───────────────────────────────

export const TOOL_DEFINITIONS: LLMTool[] = [
  {
    name: "update_lead_stage",
    description:
      "Update the CRM stage of the current lead. Use when the conversation progresses (e.g., lead showed interest, quote was requested). Do NOT use 'won' for verbal promises — only for confirmed closed sales.",
    input_schema: {
      type: "object",
      properties: {
        stage: {
          type: "string",
          enum: ["new", "contacted", "interested", "quoted", "won", "lost"],
          description: "New stage for the lead",
        },
        reason: {
          type: "string",
          description: "Brief reason for the stage change (internal note, max 200 chars)",
        },
      },
      required: ["stage"],
    },
  },
  {
    name: "update_lead_fields",
    description:
      "Update contact information (name, email, phone, city) when the lead provides or corrects their details during the conversation.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name of the lead" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number (digits, include country code)" },
        city: { type: "string", description: "City or location" },
      },
      required: [],
    },
  },
  {
    name: "add_lead_note",
    description:
      "Add a factual note to the lead record. Use to capture key facts, interests, objections, or important details shared in the conversation.",
    input_schema: {
      type: "object",
      properties: {
        note: { type: "string", description: "Note content (max 1000 chars)" },
      },
      required: ["note"],
    },
  },
  {
    name: "requalify_lead",
    description:
      "Re-run the automatic qualification engine after learning new information about the lead (e.g., business type, city, needs). Does NOT override qualifications set manually by a human.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why requalification is triggered (internal note)" },
      },
      required: [],
    },
  },
  {
    name: "assign_to_rep",
    description:
      "Request assignment of this lead to a human sales representative. The system will find the next available rep automatically. Use ONLY when the lead explicitly requests human contact or the AI cannot progress further.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why human assignment is needed (max 300 chars)" },
      },
      required: ["reason"],
    },
  },
  {
    name: "create_followup_task",
    description:
      "Create a follow-up task for the sales team. Use when the lead requests a callback, asks for more information to be sent later, or needs attention at a specific time.",
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string", description: "What needs to be done (max 500 chars)" },
        due_date: { type: "string", description: "When to follow up (e.g., '2024-12-15', 'next Monday')" },
      },
      required: ["description"],
    },
  },
  {
    name: "create_appointment_request",
    description:
      "Record that the lead has requested an appointment or demo. This does NOT confirm a booking — a human must confirm it. Use ONLY when the lead explicitly asks to schedule a meeting.",
    input_schema: {
      type: "object",
      properties: {
        preferred_time: { type: "string", description: "Lead's stated preferred time or date range" },
        notes: { type: "string", description: "Additional notes about the appointment request" },
      },
      required: [],
    },
  },
  {
    name: "transfer_to_human",
    description:
      "Transfer the conversation to a human agent immediately. Use when: the lead explicitly requests a human, a complaint arises, or the AI cannot resolve the situation. This ends the AI session.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why the conversation is being transferred (visible to the human agent, max 300 chars)",
        },
        summary: {
          type: "string",
          description: "Brief summary of the conversation for the human agent (max 500 chars)",
        },
      },
      required: ["reason"],
    },
  },
  {
    name: "end_conversation",
    description:
      "End the AI session when the conversation is naturally complete (lead said goodbye, all questions answered, no further action needed). Do NOT use if a human should follow up.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why the conversation is ending (max 200 chars)" },
      },
      required: ["reason"],
    },
  },
  {
    name: "search_knowledge_base",
    description:
      "Search the available knowledge base for information relevant to the lead's question. Use before answering questions about products, prices, or policies.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for" },
      },
      required: ["query"],
    },
  },
]

// ─── Tool executor ────────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "update_lead_stage":
        return await executeUpdateLeadStage(input, ctx)
      case "update_lead_fields":
        return await executeUpdateLeadFields(input, ctx)
      case "add_lead_note":
        return await executeAddLeadNote(input, ctx)
      case "requalify_lead":
        return await executeRequalifyLead(input, ctx)
      case "assign_to_rep":
        return await executeAssignToRep(input, ctx)
      case "create_followup_task":
        return await executeCreateFollowupTask(input, ctx)
      case "create_appointment_request":
        return await executeCreateAppointmentRequest(input, ctx)
      case "transfer_to_human":
        return await executeTransferToHuman(input, ctx)
      case "end_conversation":
        return await executeEndConversation(input, ctx)
      case "search_knowledge_base":
        return executeSearchKnowledgeBase(input, ctx)
      default:
        return { success: false, error: `Unknown tool: ${toolName}` }
    }
  } catch {
    return { success: false, error: "Tool execution failed" }
  }
}

// ─── update_lead_stage ────────────────────────────────────────────────────────

async function executeUpdateLeadStage(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const parsed = StageEnum.safeParse(input.stage)
  if (!parsed.success) return { success: false, error: "Invalid stage value" }
  if (!ctx.leadId) return { success: false, error: "No lead context" }

  const stage = parsed.data
  const reason = typeof input.reason === "string" ? input.reason.slice(0, 200) : undefined

  if (ctx.sandbox) {
    return { success: true, data: { stage, sandbox: true } }
  }

  return withIdempotency(ctx, "update_lead_stage", input, async () => {
    const { updateLeadStage } = await import("@/domains/leads/repository")
    await updateLeadStage(ctx.leadId!, ctx.orgId, stage, "ai-agent")

    if (reason) {
      const { db } = await import("@/lib/db")
      const { leadActivities } = await import("@/lib/db/schema")
      await db.insert(leadActivities).values({
        leadId: ctx.leadId!,
        orgId: ctx.orgId,
        actorId: "ai-agent",
        actorType: "system",
        activityType: "note_added",
        metadata: { note: `Etapa → "${stage}": ${reason}`, source: "ai_agent" },
      }).catch(() => undefined)
    }

    return { success: true, data: { stage } }
  })
}

// ─── update_lead_fields ───────────────────────────────────────────────────────

async function executeUpdateLeadFields(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  if (!ctx.leadId) return { success: false, error: "No lead context" }

  const fields: { name?: string; email?: string | null; phone?: string | null; city?: string | null } = {}
  if (typeof input.name === "string" && input.name.trim()) fields.name = input.name.trim().slice(0, 200)
  if (typeof input.email === "string") fields.email = input.email.trim().slice(0, 200) || null
  if (typeof input.phone === "string") fields.phone = input.phone.replace(/\D/g, "").slice(0, 20) || null
  if (typeof input.city === "string") fields.city = input.city.trim().slice(0, 100) || null

  if (Object.keys(fields).length === 0) return { success: false, error: "No valid fields provided" }

  if (ctx.sandbox) {
    return { success: true, data: { updated: Object.keys(fields), sandbox: true } }
  }

  return withIdempotency(ctx, "update_lead_fields", input, async () => {
    const { updateLeadInfo } = await import("@/domains/leads/repository")
    await updateLeadInfo(ctx.leadId!, ctx.orgId, fields)
    return { success: true, data: { updated: Object.keys(fields) } }
  })
}

// ─── add_lead_note ────────────────────────────────────────────────────────────

async function executeAddLeadNote(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 1000) : ""
  if (!note) return { success: false, error: "Note content is required" }
  if (!ctx.leadId) return { success: false, error: "No lead context" }

  if (ctx.sandbox) {
    return { success: true, data: { recorded: true, sandbox: true } }
  }

  return withIdempotency(ctx, "add_lead_note", input, async () => {
    const { db } = await import("@/lib/db")
    const { leadActivities } = await import("@/lib/db/schema")

    await db.insert(leadActivities).values({
      leadId: ctx.leadId!,
      orgId: ctx.orgId,
      actorId: "ai-agent",
      actorType: "system",
      activityType: "note_added",
      metadata: { note, source: "ai_agent" },
    })

    return { success: true, data: { recorded: true } }
  })
}

// ─── requalify_lead ───────────────────────────────────────────────────────────

async function executeRequalifyLead(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  if (!ctx.leadId) return { success: false, error: "No lead context" }

  if (ctx.sandbox) {
    return { success: true, data: { requalified: true, sandbox: true } }
  }

  return withIdempotency(ctx, "requalify_lead", input, async () => {
    // Resolve lead's campaignId (autoQualifyLeadInternal uses it for profile lookup)
    const { db } = await import("@/lib/db")
    const { leads } = await import("@/lib/db/schema")
    const { eq, and } = await import("drizzle-orm")

    const row = await db
      .select({ campaignId: leads.campaignId })
      .from(leads)
      .where(and(eq(leads.id, ctx.leadId!), eq(leads.orgId, ctx.orgId)))
      .limit(1)

    const campaignId = row[0]?.campaignId ?? undefined

    // Preserves manual override — autoQualifyLeadInternal checks effective_qual_class guard
    const { autoQualifyLeadInternal } = await import("@/domains/qualification/actions")
    await autoQualifyLeadInternal(ctx.leadId!, ctx.orgId, campaignId)

    return { success: true, data: { requalified: true } }
  })
}

// ─── assign_to_rep ────────────────────────────────────────────────────────────

async function executeAssignToRep(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  if (!ctx.leadId) return { success: false, error: "No lead context" }
  const reason = typeof input.reason === "string" ? input.reason.slice(0, 300) : "Solicitado por IA"

  if (ctx.sandbox) {
    return { success: true, data: { flagged: true, sandbox: true } }
  }

  return withIdempotency(ctx, "assign_to_rep", input, async () => {
    const { db } = await import("@/lib/db")
    const { leadActivities, waConversations, salesReps } = await import("@/lib/db/schema")
    const { eq, and } = await import("drizzle-orm")

    // Find first active rep in this org
    const reps = await db
      .select({ id: salesReps.id })
      .from(salesReps)
      .where(and(eq(salesReps.orgId, ctx.orgId), eq(salesReps.active, true)))
      .orderBy(salesReps.createdAt)
      .limit(1)

    let repAssigned = false
    if (reps[0]) {
      const { assignLeadToRep } = await import("@/domains/team/repository")
      await assignLeadToRep(ctx.leadId!, ctx.orgId, reps[0].id, "ai-agent", reason)
      repAssigned = true
    }

    // Log the assignment request as activity
    await db.insert(leadActivities).values({
      leadId: ctx.leadId!,
      orgId: ctx.orgId,
      actorId: "ai-agent",
      actorType: "system",
      activityType: "note_added",
      metadata: {
        note: repAssigned
          ? `Asignado a representante por IA. Motivo: ${reason}`
          : `IA solicitó asignación humana (sin representantes disponibles). Motivo: ${reason}`,
        source: "ai_agent",
      },
    }).catch(() => undefined)

    // Flag conversation for human attention regardless of whether a rep was found
    await db
      .update(waConversations)
      .set({ controlMode: "waiting_human", updatedAt: new Date() })
      .where(and(eq(waConversations.id, ctx.conversationId), eq(waConversations.orgId, ctx.orgId)))
      .catch(() => undefined)

    return { success: true, data: { flagged: true, repAssigned, humanAssignmentNeeded: true } }
  })
}

// ─── create_followup_task ─────────────────────────────────────────────────────

async function executeCreateFollowupTask(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  if (!ctx.leadId) return { success: false, error: "No lead context" }

  const description = typeof input.description === "string" ? input.description.trim().slice(0, 500) : ""
  if (!description) return { success: false, error: "Task description is required" }
  const dueDate = typeof input.due_date === "string" ? input.due_date.trim() : null

  if (ctx.sandbox) {
    return { success: true, data: { created: true, description, dueDate, sandbox: true } }
  }

  return withIdempotency(ctx, "create_followup_task", input, async () => {
    const { db } = await import("@/lib/db")
    const { leadActivities } = await import("@/lib/db/schema")

    const note = dueDate
      ? `TAREA DE SEGUIMIENTO: ${description} (para: ${dueDate})`
      : `TAREA DE SEGUIMIENTO: ${description}`

    await db.insert(leadActivities).values({
      leadId: ctx.leadId!,
      orgId: ctx.orgId,
      actorId: "ai-agent",
      actorType: "system",
      activityType: "note_added",
      metadata: { type: "followup_task", description, dueDate, note, source: "ai_agent" },
    })

    return { success: true, data: { created: true, description, dueDate } }
  })
}

// ─── create_appointment_request ───────────────────────────────────────────────

async function executeCreateAppointmentRequest(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  if (!ctx.leadId) return { success: false, error: "No lead context" }

  const preferredTime = typeof input.preferred_time === "string" ? input.preferred_time : ""
  const notes = typeof input.notes === "string" ? input.notes : ""
  const note = ["SOLICITUD DE CITA:", preferredTime && `Horario: ${preferredTime}`, notes && `Notas: ${notes}`]
    .filter(Boolean)
    .join(" ")

  if (ctx.sandbox) {
    return { success: true, data: { recorded: true, confirmed: false, sandbox: true } }
  }

  return withIdempotency(ctx, "create_appointment_request", input, async () => {
    const { db } = await import("@/lib/db")
    const { leadActivities } = await import("@/lib/db/schema")

    await db.insert(leadActivities).values({
      leadId: ctx.leadId!,
      orgId: ctx.orgId,
      actorId: "ai-agent",
      actorType: "system",
      activityType: "note_added",
      metadata: { type: "appointment_request", note, source: "ai_agent" },
    })

    return { success: true, data: { recorded: true, confirmed: false } }
  })
}

// ─── transfer_to_human ────────────────────────────────────────────────────────

async function executeTransferToHuman(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const reason = typeof input.reason === "string" ? input.reason.slice(0, 300) : "Transferencia solicitada"
  const summary = typeof input.summary === "string" ? input.summary.slice(0, 500) : null

  if (ctx.sandbox) {
    return { success: true, data: { transferred: true, sandbox: true }, signal: "transfer" }
  }

  return withIdempotency(ctx, "transfer_to_human", input, async () => {
    const { db } = await import("@/lib/db")
    const { waConversations, leadActivities } = await import("@/lib/db/schema")
    const { eq, and } = await import("drizzle-orm")

    // Atomic: save summary + switch to waiting_human in one UPDATE
    await db
      .update(waConversations)
      .set({
        controlMode: "waiting_human",
        ...(summary ? { summary } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(waConversations.id, ctx.conversationId), eq(waConversations.orgId, ctx.orgId)))

    if (ctx.leadId) {
      await db.insert(leadActivities).values({
        leadId: ctx.leadId,
        orgId: ctx.orgId,
        actorId: "ai-agent",
        actorType: "system",
        activityType: "note_added",
        metadata: { type: "human_transfer", reason, note: `TRANSFERENCIA: ${reason}`, source: "ai_agent" },
      }).catch(() => undefined)
    }

    return { success: true, data: { transferred: true, reason }, signal: "transfer" }
  })
}

// ─── end_conversation ─────────────────────────────────────────────────────────

async function executeEndConversation(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const reason = typeof input.reason === "string" ? input.reason.slice(0, 200) : "Conversación finalizada"

  if (ctx.sandbox) {
    return { success: true, data: { ended: true, sandbox: true }, signal: "end" }
  }

  return withIdempotency(ctx, "end_conversation", input, async () => {
    const { db } = await import("@/lib/db")
    const { waConversations, leadActivities } = await import("@/lib/db/schema")
    const { eq, and } = await import("drizzle-orm")

    await db
      .update(waConversations)
      .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(waConversations.id, ctx.conversationId), eq(waConversations.orgId, ctx.orgId)))

    if (ctx.leadId) {
      await db.insert(leadActivities).values({
        leadId: ctx.leadId,
        orgId: ctx.orgId,
        actorId: "ai-agent",
        actorType: "system",
        activityType: "note_added",
        metadata: { type: "conversation_ended", reason, note: `CIERRE: ${reason}`, source: "ai_agent" },
      }).catch(() => undefined)
    }

    return { success: true, data: { ended: true, reason }, signal: "end" }
  })
}

// ─── search_knowledge_base (sync, no side effects, no idempotency needed) ─────

function executeSearchKnowledgeBase(
  input: Record<string, unknown>,
  ctx: ToolContext
): ToolResult {
  const query = typeof input.query === "string" ? input.query.toLowerCase() : ""
  if (!query) return { success: false, error: "Query is required" }

  const matches = ctx.knowledgeChunks
    .filter((chunk) => chunk.content.toLowerCase().includes(query))
    .slice(0, 3)

  return {
    success: true,
    data: {
      found: matches.length,
      results: matches.map((chunk) => ({
        sourceName: chunk.sourceName,
        excerpt: chunk.content.slice(0, 500),
      })),
    },
  }
}

// ─── Get enabled tools filtered by agent config ───────────────────────────────

export function getEnabledTools(
  enabledActions: Record<string, { enabled: boolean }>,
  sandbox: boolean
): LLMTool[] {
  return TOOL_DEFINITIONS.filter((tool) => {
    if (tool.name === "search_knowledge_base" && sandbox) return true
    return enabledActions[tool.name]?.enabled === true
  })
}

"use server"

import { requireOrganizationMembership, requireRole } from "@/lib/auth/server"
import { db } from "@/lib/db"
import {
  waConversations,
  waConversationMessages,
  waPhoneNumbers,
  waBusinessAccounts,
  aiAgentDeployments,
  aiDeploymentSchedules,
} from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { z } from "zod"
import {
  listInboxConversations,
  getConversationDetail,
  takeConversation,
  releaseConversation,
  returnToAi,
  resolveConversation,
  reopenConversation,
  addNote,
  listNotes,
  type InboxFilter,
} from "./inbox-repository"
import { CloudApiClient } from "@/domains/wa-cloud/client"
import { decryptTokenVersioned } from "@/lib/crypto"

// ─── List inbox ───────────────────────────────────────────────────────────────

const ALLOWED_FILTERS: InboxFilter[] = ["mine", "unassigned", "ai_active", "waiting_human", "closed"]

export async function getInboxAction(filter: InboxFilter = "waiting_human", page = 1) {
  const ctx = await requireOrganizationMembership()
  if (!ALLOWED_FILTERS.includes(filter)) {
    return { success: false as const, error: "Filtro inválido" }
  }
  const conversations = await listInboxConversations({
    orgId: ctx.orgId,
    userId: ctx.userId,
    filter,
    page,
  })
  return { success: true as const, conversations }
}

// ─── Conversation detail ──────────────────────────────────────────────────────

export async function getConversationDetailAction(conversationId: string, messagePage = 1) {
  const ctx = await requireOrganizationMembership()
  const parsed = z.string().uuid().safeParse(conversationId)
  if (!parsed.success) return { success: false as const, error: "ID inválido" }

  const detail = await getConversationDetail({
    orgId: ctx.orgId,
    conversationId: parsed.data,
    messagePage,
  })
  if (!detail) return { success: false as const, error: "Conversación no encontrada" }
  return { success: true as const, detail }
}

// ─── Take conversation ────────────────────────────────────────────────────────

export async function takeConversationAction(conversationId: string) {
  const ctx = await requireRole(["owner", "admin", "manager", "agent"])
  const parsed = z.string().uuid().safeParse(conversationId)
  if (!parsed.success) return { success: false as const, error: "ID inválido" }

  const result = await takeConversation({
    orgId: ctx.orgId,
    conversationId: parsed.data,
    userId: ctx.userId,
  })

  if (!result.taken) {
    return { success: false as const, error: result.reason ?? "No se pudo tomar la conversación." }
  }
  return { success: true as const }
}

// ─── Release conversation ─────────────────────────────────────────────────────

export async function releaseConversationAction(conversationId: string) {
  const ctx = await requireRole(["owner", "admin", "manager", "agent"])
  const parsed = z.string().uuid().safeParse(conversationId)
  if (!parsed.success) return { success: false as const, error: "ID inválido" }

  const result = await releaseConversation({
    orgId: ctx.orgId,
    conversationId: parsed.data,
    userId: ctx.userId,
  })

  return result.released
    ? { success: true as const }
    : { success: false as const, error: "No se pudo liberar la conversación." }
}

// ─── Reply ────────────────────────────────────────────────────────────────────

const ReplyInputSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1).max(4096),
})

export async function replyAction(input: { conversationId: string; text: string }) {
  const ctx = await requireRole(["owner", "admin", "manager", "agent"])
  const parsed = ReplyInputSchema.safeParse(input)
  if (!parsed.success) return { success: false as const, error: "Datos inválidos" }

  // Verify conversation belongs to org and is in human mode
  const convRows = await db
    .select({
      id: waConversations.id,
      controlMode: waConversations.controlMode,
      status: waConversations.status,
      phoneNumberId: waConversations.phoneNumberId,
      customerPhone: waConversations.customerPhone,
      assignedTo: waConversations.assignedTo,
      lastMessageAt: waConversations.lastMessageAt,
    })
    .from(waConversations)
    .where(
      and(
        eq(waConversations.id, parsed.data.conversationId),
        eq(waConversations.orgId, ctx.orgId),
      )
    )
    .limit(1)

  const conv = convRows[0]
  if (!conv) return { success: false as const, error: "Conversación no encontrada" }
  if (conv.status === "closed") return { success: false as const, error: "La conversación está cerrada." }
  if (conv.controlMode !== "human") {
    return {
      success: false as const,
      error: "Solo puedes responder cuando tienes el control de la conversación. Toma la conversación primero.",
    }
  }

  // Check 24-hour eligibility (Meta Cloud API window)
  const lastMessageAt = conv.lastMessageAt
  const now = new Date()
  const hoursSinceLastMsg = (now.getTime() - lastMessageAt.getTime()) / 1000 / 3600
  if (hoursSinceLastMsg > 24) {
    return {
      success: false as const,
      error: "Han pasado más de 24 horas desde el último mensaje del contacto. Solo puedes enviar plantillas aprobadas en este momento.",
      requiresTemplate: true,
    }
  }

  // Fetch phone credentials
  const phoneRows = await db
    .select({
      metaPhoneNumberId: waPhoneNumbers.phoneNumberId,
      accessTokenEnc: waBusinessAccounts.accessTokenEnc,
    })
    .from(waPhoneNumbers)
    .innerJoin(waBusinessAccounts, eq(waPhoneNumbers.wabaAccountId, waBusinessAccounts.id))
    .where(
      and(
        eq(waPhoneNumbers.id, conv.phoneNumberId),
        eq(waPhoneNumbers.orgId, ctx.orgId),
      )
    )
    .limit(1)

  const phoneRow = phoneRows[0]
  if (!phoneRow?.accessTokenEnc) {
    return { success: false as const, error: "Sin credenciales de WhatsApp configuradas." }
  }

  const accessToken = decryptTokenVersioned(phoneRow.accessTokenEnc)
  const client = new CloudApiClient(accessToken, { timeoutMs: 10_000, maxRetries: 1 })

  const outcome = await client.sendText({
    phoneNumberId: phoneRow.metaPhoneNumberId,
    to: conv.customerPhone,
    text: parsed.data.text,
  })

  if (outcome.kind === "error") {
    return {
      success: false as const,
      error: outcome.permanent
        ? "Error permanente al enviar. Verifica el número y los permisos."
        : "Error transitorio al enviar. Intenta nuevamente.",
    }
  }
  if (outcome.kind === "timeout_unknown") {
    return { success: false as const, error: "Tiempo de espera agotado. El mensaje puede haberse enviado." }
  }

  const externalMessageId = outcome.messageId

  // Record message in DB
  await db
    .insert(waConversationMessages)
    .values({
      orgId: ctx.orgId,
      conversationId: parsed.data.conversationId,
      direction: "outbound",
      role: "assistant",
      content: parsed.data.text,
      contentType: "text",
      externalMessageId,
      status: "sent",
      isAi: false,
    })

  await db
    .update(waConversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(waConversations.id, parsed.data.conversationId))

  return { success: true as const, messageId: externalMessageId }
}

// ─── Return to AI ─────────────────────────────────────────────────────────────

const ReturnToAiInputSchema = z.object({
  conversationId: z.string().uuid(),
})

export async function returnToAiAction(input: { conversationId: string }) {
  const ctx = await requireRole(["owner", "admin", "manager", "agent"])
  const parsed = ReturnToAiInputSchema.safeParse(input)
  if (!parsed.success) return { success: false as const, error: "Datos inválidos" }

  const convRows = await db
    .select({
      id: waConversations.id,
      status: waConversations.status,
      deploymentId: waConversations.deploymentId,
      leadId: waConversations.leadId,
      lastMessageAt: waConversations.lastMessageAt,
    })
    .from(waConversations)
    .where(
      and(
        eq(waConversations.id, parsed.data.conversationId),
        eq(waConversations.orgId, ctx.orgId),
      )
    )
    .limit(1)

  const conv = convRows[0]
  if (!conv) return { success: false as const, error: "Conversación no encontrada" }
  if (conv.status === "closed") return { success: false as const, error: "La conversación está cerrada." }

  const result = await returnToAi({
    orgId: ctx.orgId,
    conversationId: parsed.data.conversationId,
    agentVersionId: "",
    triggerMessageId: crypto.randomUUID(),
    deploymentId: conv.deploymentId,
    leadId: conv.leadId,
  })

  return result.returned
    ? { success: true as const, episodeId: result.episodeId }
    : { success: false as const, error: "No se pudo devolver la conversación al agente." }
}

// ─── Resolve conversation ─────────────────────────────────────────────────────

export async function resolveAction(conversationId: string) {
  const ctx = await requireRole(["owner", "admin", "manager", "agent"])
  const parsed = z.string().uuid().safeParse(conversationId)
  if (!parsed.success) return { success: false as const, error: "ID inválido" }

  const result = await resolveConversation({
    orgId: ctx.orgId,
    conversationId: parsed.data,
  })

  return result.resolved
    ? { success: true as const }
    : { success: false as const, error: "No se pudo resolver la conversación." }
}

// ─── Reopen conversation ──────────────────────────────────────────────────────

export async function reopenAction(conversationId: string) {
  const ctx = await requireRole(["owner", "admin", "manager", "agent"])
  const parsed = z.string().uuid().safeParse(conversationId)
  if (!parsed.success) return { success: false as const, error: "ID inválido" }

  const result = await reopenConversation({
    orgId: ctx.orgId,
    conversationId: parsed.data,
  })

  return result.reopened
    ? { success: true as const }
    : { success: false as const, error: "No se pudo reabrir la conversación." }
}

// ─── Add note ─────────────────────────────────────────────────────────────────

const AddNoteInputSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(2000),
})

export async function addNoteAction(input: { conversationId: string; body: string }) {
  const ctx = await requireRole(["owner", "admin", "manager", "agent"])
  const parsed = AddNoteInputSchema.safeParse(input)
  if (!parsed.success) return { success: false as const, error: "Datos inválidos" }

  const note = await addNote({
    orgId: ctx.orgId,
    conversationId: parsed.data.conversationId,
    authorId: ctx.userId,
    body: parsed.data.body,
  }).catch((err: Error) => ({ error: err.message }))

  if ("error" in note) return { success: false as const, error: note.error }
  return { success: true as const, note }
}

// ─── List notes ───────────────────────────────────────────────────────────────

export async function listNotesAction(conversationId: string) {
  const ctx = await requireOrganizationMembership()
  const parsed = z.string().uuid().safeParse(conversationId)
  if (!parsed.success) return { success: false as const, error: "ID inválido" }

  const notes = await listNotes({
    orgId: ctx.orgId,
    conversationId: parsed.data,
  })
  return { success: true as const, notes }
}

// ─── Toggle deployment pause ──────────────────────────────────────────────────

export async function toggleDeploymentPauseAction(deploymentId: string) {
  const ctx = await requireRole(["owner", "admin", "manager"])
  const parsed = z.string().uuid().safeParse(deploymentId)
  if (!parsed.success) return { success: false as const, error: "ID inválido" }

  const depRows = await db
    .select({ id: aiAgentDeployments.id, paused: aiAgentDeployments.paused })
    .from(aiAgentDeployments)
    .where(
      and(
        eq(aiAgentDeployments.id, parsed.data),
        eq(aiAgentDeployments.orgId, ctx.orgId),
      )
    )
    .limit(1)

  const dep = depRows[0]
  if (!dep) return { success: false as const, error: "Despliegue no encontrado" }

  const nowPaused = !dep.paused
  await db
    .update(aiAgentDeployments)
    .set({
      paused: nowPaused,
      pausedAt: nowPaused ? new Date() : null,
      pausedBy: nowPaused ? ctx.userId : null,
      updatedAt: new Date(),
    })
    .where(eq(aiAgentDeployments.id, parsed.data))

  return { success: true as const, paused: nowPaused }
}

// ─── Upsert deployment schedule ───────────────────────────────────────────────

const ScheduleWindowSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
})

const UpsertScheduleSchema = z.object({
  deploymentId: z.string().uuid(),
  timezone: z.string().min(1).max(64),
  windows: z.record(z.string(), z.array(ScheduleWindowSchema)),
  enabled: z.boolean(),
})

export async function upsertScheduleAction(input: {
  deploymentId: string
  timezone: string
  windows: Record<string, Array<{ start: string; end: string }>>
  enabled: boolean
}) {
  const ctx = await requireRole(["owner", "admin", "manager"])
  const parsed = UpsertScheduleSchema.safeParse(input)
  if (!parsed.success) return { success: false as const, error: "Datos inválidos: " + parsed.error.issues[0]?.message }

  // Verify deployment belongs to org
  const dep = await db
    .select({ id: aiAgentDeployments.id })
    .from(aiAgentDeployments)
    .where(
      and(
        eq(aiAgentDeployments.id, parsed.data.deploymentId),
        eq(aiAgentDeployments.orgId, ctx.orgId),
      )
    )
    .limit(1)

  if (!dep[0]) return { success: false as const, error: "Despliegue no encontrado" }

  await db
    .insert(aiDeploymentSchedules)
    .values({
      orgId: ctx.orgId,
      deploymentId: parsed.data.deploymentId,
      timezone: parsed.data.timezone,
      windows: parsed.data.windows,
      enabled: parsed.data.enabled,
    })
    .onConflictDoUpdate({
      target: aiDeploymentSchedules.deploymentId,
      set: {
        timezone: parsed.data.timezone,
        windows: parsed.data.windows,
        enabled: parsed.data.enabled,
        updatedAt: new Date(),
      },
    })

  return { success: true as const }
}

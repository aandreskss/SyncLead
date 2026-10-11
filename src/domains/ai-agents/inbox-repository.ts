import "server-only"
import { db } from "@/lib/db"
import {
  waConversations,
  waConversationMessages,
  waConversationNotes,
  aiMessageQueue,
  leads,
  users,
  orgMembers,
} from "@/lib/db/schema"
import { eq, and, desc, or, isNull, not, inArray, lt, count } from "drizzle-orm"
import { resolveEpisodeForConversation } from "./router"

// ─── Types ────────────────────────────────────────────────────────────────────

export type InboxFilter =
  | "mine"
  | "unassigned"
  | "ai_active"
  | "waiting_human"
  | "closed"

export type InboxConversation = {
  id: string
  orgId: string
  customerPhone: string
  customerName: string | null
  controlMode: string
  status: string
  assignedTo: string | null
  assignedUserName: string | null
  leadId: string | null
  lastMessageAt: Date
  messageCount: number
  summary: string | null
  deploymentId: string | null
  lastMessage: string | null
}

export type ConversationDetail = {
  conversation: typeof waConversations.$inferSelect
  messages: (typeof waConversationMessages.$inferSelect)[]
  notes: (typeof waConversationNotes.$inferSelect & { authorName: string | null })[]
  lead: {
    id: string
    name: string | null
    email: string | null
    phone: string | null
    temperature: string | null
    stage: string | null
    campaignId: string | null
    notes: string | null
  } | null
  assignedUser: { id: string; name: string | null; email: string | null } | null
  totalMessages: number
}

// ─── List inbox conversations ─────────────────────────────────────────────────

export async function listInboxConversations(params: {
  orgId: string
  userId: string
  filter: InboxFilter
  page?: number
  pageSize?: number
}): Promise<InboxConversation[]> {
  const { orgId, userId, filter, page = 1, pageSize = 30 } = params
  const offset = (page - 1) * pageSize

  const conditions = [eq(waConversations.orgId, orgId)]

  switch (filter) {
    case "mine":
      conditions.push(eq(waConversations.assignedTo, userId))
      break
    case "unassigned":
      conditions.push(isNull(waConversations.assignedTo))
      conditions.push(not(eq(waConversations.status, "closed")))
      break
    case "ai_active":
      conditions.push(eq(waConversations.controlMode, "ai"))
      conditions.push(not(eq(waConversations.status, "closed")))
      break
    case "waiting_human":
      conditions.push(
        or(
          eq(waConversations.controlMode, "waiting_human"),
          eq(waConversations.controlMode, "paused"),
        )!
      )
      conditions.push(not(eq(waConversations.status, "closed")))
      break
    case "closed":
      conditions.push(eq(waConversations.status, "closed"))
      break
  }

  const rows = await db
    .select({
      id: waConversations.id,
      orgId: waConversations.orgId,
      customerPhone: waConversations.customerPhone,
      customerName: waConversations.customerName,
      controlMode: waConversations.controlMode,
      status: waConversations.status,
      assignedTo: waConversations.assignedTo,
      assignedUserName: users.name,
      leadId: waConversations.leadId,
      lastMessageAt: waConversations.lastMessageAt,
      messageCount: waConversations.messageCount,
      summary: waConversations.summary,
      deploymentId: waConversations.deploymentId,
    })
    .from(waConversations)
    .leftJoin(users, eq(waConversations.assignedTo, users.id))
    .where(and(...conditions))
    .orderBy(desc(waConversations.lastMessageAt))
    .limit(pageSize)
    .offset(offset)

  // Fetch last message preview per conversation
  const convIds = rows.map(r => r.id)
  if (convIds.length === 0) return []

  const lastMsgs = await db
    .select({
      conversationId: waConversationMessages.conversationId,
      content: waConversationMessages.content,
    })
    .from(waConversationMessages)
    .where(
      and(
        inArray(waConversationMessages.conversationId, convIds),
        eq(waConversationMessages.orgId, orgId),
      )
    )
    .orderBy(desc(waConversationMessages.createdAt))
    .limit(convIds.length * 2) // over-fetch; group in JS

  const lastMsgMap = new Map<string, string>()
  for (const m of lastMsgs) {
    if (!lastMsgMap.has(m.conversationId)) {
      lastMsgMap.set(m.conversationId, m.content)
    }
  }

  return rows.map(r => ({
    ...r,
    lastMessage: lastMsgMap.get(r.id) ?? null,
  }))
}

// ─── Get conversation detail ──────────────────────────────────────────────────

export async function getConversationDetail(params: {
  orgId: string
  conversationId: string
  messagePage?: number
  messagePageSize?: number
}): Promise<ConversationDetail | null> {
  const { orgId, conversationId, messagePage = 1, messagePageSize = 50 } = params

  const [convRows, totalRows] = await Promise.all([
    db
      .select()
      .from(waConversations)
      .where(and(eq(waConversations.id, conversationId), eq(waConversations.orgId, orgId)))
      .limit(1),
    db
      .select({ cnt: count() })
      .from(waConversationMessages)
      .where(
        and(
          eq(waConversationMessages.conversationId, conversationId),
          eq(waConversationMessages.orgId, orgId),
        )
      ),
  ])

  const conversation = convRows[0]
  if (!conversation) return null

  const totalMessages = totalRows[0]?.cnt ?? 0
  const offset = (messagePage - 1) * messagePageSize

  const [messages, notes, lead, assignedUser] = await Promise.all([
    db
      .select()
      .from(waConversationMessages)
      .where(
        and(
          eq(waConversationMessages.conversationId, conversationId),
          eq(waConversationMessages.orgId, orgId),
        )
      )
      .orderBy(desc(waConversationMessages.createdAt))
      .limit(messagePageSize)
      .offset(offset),
    db
      .select({
        id: waConversationNotes.id,
        orgId: waConversationNotes.orgId,
        conversationId: waConversationNotes.conversationId,
        authorId: waConversationNotes.authorId,
        authorName: users.name,
        body: waConversationNotes.body,
        createdAt: waConversationNotes.createdAt,
        updatedAt: waConversationNotes.updatedAt,
      })
      .from(waConversationNotes)
      .leftJoin(users, eq(waConversationNotes.authorId, users.id))
      .where(
        and(
          eq(waConversationNotes.conversationId, conversationId),
          eq(waConversationNotes.orgId, orgId),
        )
      )
      .orderBy(desc(waConversationNotes.createdAt)),
    conversation.leadId
      ? db
          .select({
            id: leads.id,
            name: leads.name,
            email: leads.email,
            phone: leads.phone,
            temperature: leads.temperature,
            stage: leads.stage,
            campaignId: leads.campaignId,
            notes: leads.notes,
          })
          .from(leads)
          .where(eq(leads.id, conversation.leadId))
          .limit(1)
      : Promise.resolve([]),
    conversation.assignedTo
      ? db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, conversation.assignedTo))
          .limit(1)
      : Promise.resolve([]),
  ])

  return {
    conversation,
    messages: messages.reverse(), // chronological
    notes,
    lead: (lead as { id: string; name: string | null; email: string | null; phone: string | null; temperature: string | null; stage: string | null; campaignId: string | null; notes: string | null }[])[0] ?? null,
    assignedUser: (assignedUser as { id: string; name: string | null; email: string | null }[])[0] ?? null,
    totalMessages,
  }
}

// ─── Take conversation (atomic) ───────────────────────────────────────────────

export async function takeConversation(params: {
  orgId: string
  conversationId: string
  userId: string
}): Promise<{ taken: boolean; reason?: string }> {
  // Atomic: only succeeds if controlMode is NOT already 'human'
  const updated = await db
    .update(waConversations)
    .set({
      controlMode: "human",
      assignedTo: params.userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(waConversations.id, params.conversationId),
        eq(waConversations.orgId, params.orgId),
        not(eq(waConversations.controlMode, "human")),
        not(eq(waConversations.status, "closed")),
      )
    )
    .returning({ id: waConversations.id })

  if (updated.length === 0) {
    return { taken: false, reason: "La conversación ya fue tomada por otro agente o está cerrada." }
  }

  // Cancel pending AI queue items for this conversation
  await db
    .update(aiMessageQueue)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(aiMessageQueue.conversationId, params.conversationId),
        eq(aiMessageQueue.orgId, params.orgId),
        inArray(aiMessageQueue.status, ["enqueued", "processing"]),
      )
    )
    .catch(() => undefined)

  return { taken: true }
}

// ─── Release conversation (back to unassigned) ────────────────────────────────

export async function releaseConversation(params: {
  orgId: string
  conversationId: string
  userId: string
}): Promise<{ released: boolean }> {
  const updated = await db
    .update(waConversations)
    .set({
      controlMode: "waiting_human",
      assignedTo: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(waConversations.id, params.conversationId),
        eq(waConversations.orgId, params.orgId),
        eq(waConversations.assignedTo, params.userId),
      )
    )
    .returning({ id: waConversations.id })

  return { released: updated.length > 0 }
}

// ─── Return to AI ─────────────────────────────────────────────────────────────

export async function returnToAi(params: {
  orgId: string
  conversationId: string
  agentVersionId: string
  triggerMessageId: string
  deploymentId: string | null
  leadId: string | null
}): Promise<{ returned: boolean; episodeId?: string }> {
  await db
    .update(waConversations)
    .set({ controlMode: "ai", assignedTo: null, updatedAt: new Date() })
    .where(
      and(
        eq(waConversations.id, params.conversationId),
        eq(waConversations.orgId, params.orgId),
      )
    )

  const episode = await resolveEpisodeForConversation({
    orgId: params.orgId,
    conversationId: params.conversationId,
    deploymentId: params.deploymentId,
    leadId: params.leadId,
    triggerMessageId: params.triggerMessageId,
  })

  return { returned: true, episodeId: episode?.episodeId }
}

// ─── Resolve conversation ─────────────────────────────────────────────────────

export async function resolveConversation(params: {
  orgId: string
  conversationId: string
}): Promise<{ resolved: boolean }> {
  const updated = await db
    .update(waConversations)
    .set({
      status: "closed",
      closedAt: new Date(),
      controlMode: "paused",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(waConversations.id, params.conversationId),
        eq(waConversations.orgId, params.orgId),
        not(eq(waConversations.status, "closed")),
      )
    )
    .returning({ id: waConversations.id })

  return { resolved: updated.length > 0 }
}

// ─── Reopen conversation ──────────────────────────────────────────────────────

export async function reopenConversation(params: {
  orgId: string
  conversationId: string
}): Promise<{ reopened: boolean }> {
  const updated = await db
    .update(waConversations)
    .set({
      status: "active",
      closedAt: null,
      controlMode: "waiting_human",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(waConversations.id, params.conversationId),
        eq(waConversations.orgId, params.orgId),
        eq(waConversations.status, "closed"),
      )
    )
    .returning({ id: waConversations.id })

  return { reopened: updated.length > 0 }
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export async function addNote(params: {
  orgId: string
  conversationId: string
  authorId: string
  body: string
}): Promise<typeof waConversationNotes.$inferSelect> {
  const conv = await db
    .select({ id: waConversations.id })
    .from(waConversations)
    .where(
      and(
        eq(waConversations.id, params.conversationId),
        eq(waConversations.orgId, params.orgId),
      )
    )
    .limit(1)
  if (!conv[0]) throw new Error("Conversation not found")

  const [note] = await db
    .insert(waConversationNotes)
    .values({
      orgId: params.orgId,
      conversationId: params.conversationId,
      authorId: params.authorId,
      body: params.body,
    })
    .returning()

  return note!
}

export async function listNotes(params: {
  orgId: string
  conversationId: string
}): Promise<(typeof waConversationNotes.$inferSelect & { authorName: string | null })[]> {
  return db
    .select({
      id: waConversationNotes.id,
      orgId: waConversationNotes.orgId,
      conversationId: waConversationNotes.conversationId,
      authorId: waConversationNotes.authorId,
      authorName: users.name,
      body: waConversationNotes.body,
      createdAt: waConversationNotes.createdAt,
      updatedAt: waConversationNotes.updatedAt,
    })
    .from(waConversationNotes)
    .leftJoin(users, eq(waConversationNotes.authorId, users.id))
    .where(
      and(
        eq(waConversationNotes.conversationId, params.conversationId),
        eq(waConversationNotes.orgId, params.orgId),
      )
    )
    .orderBy(desc(waConversationNotes.createdAt))
}

// ─── Schedule helpers ─────────────────────────────────────────────────────────

export type ScheduleWindows = Record<string, Array<{ start: string; end: string }>>

/**
 * Returns true if the current moment (in IANA timezone) falls within any
 * configured window for that weekday.
 */
export function isWithinSchedule(
  windows: ScheduleWindows,
  timezone: string,
): boolean {
  const now = new Date()
  const localStr = now.toLocaleString("en-US", { timeZone: timezone, hour12: false })
  const localDate = new Date(localStr)
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
  const dayKey = days[localDate.getDay()]!
  const hh = localDate.getHours().toString().padStart(2, "0")
  const mm = localDate.getMinutes().toString().padStart(2, "0")
  const currentTime = `${hh}:${mm}`
  const dayWindows = windows[dayKey] ?? []
  return dayWindows.some(w => currentTime >= w.start && currentTime < w.end)
}

import "server-only"
import { db } from "@/lib/db"
import {
  waPhoneNumbers,
  waBusinessAccounts,
  waConversations,
  waConversationMessages,
  aiMessageQueue,
} from "@/lib/db/schema"
import { eq, and, desc, notInArray } from "drizzle-orm"
import type { ParsedIncomingMessage, ParsedStatusUpdate } from "./types"

// ─── Tenant resolution ────────────────────────────────────────────────────────

export interface PhoneNumberTenant {
  phoneNumberRowId: string  // UUID PK in wa_phone_numbers
  orgId: string
  wabaId: string
  accessTokenEnc: string | null
  keyVersion: number
}

/**
 * Auto-registers a phone number from webhook metadata when it doesn't exist yet.
 * This handles the case where fetchPhoneNumbers failed during OAuth but the
 * phone number is now receiving messages.
 */
export async function autoRegisterPhoneNumberFromWebhook(params: {
  wabaExternalId: string
  phoneNumberId: string
  displayPhoneNumber: string
}): Promise<PhoneNumberTenant | null> {
  const wabaRow = await db
    .select({
      id: waBusinessAccounts.id,
      orgId: waBusinessAccounts.orgId,
      wabaId: waBusinessAccounts.wabaId,
      accessTokenEnc: waBusinessAccounts.accessTokenEnc,
      keyVersion: waBusinessAccounts.keyVersion,
    })
    .from(waBusinessAccounts)
    .where(eq(waBusinessAccounts.wabaId, params.wabaExternalId))
    .limit(1)

  const waba = wabaRow[0]
  if (!waba) return null

  await db
    .insert(waPhoneNumbers)
    .values({
      orgId: waba.orgId,
      wabaAccountId: waba.id,
      phoneNumberId: params.phoneNumberId,
      displayPhoneNumber: params.displayPhoneNumber,
      status: "active",
    })
    .onConflictDoNothing()

  const phoneRow = await db
    .select({ id: waPhoneNumbers.id })
    .from(waPhoneNumbers)
    .where(eq(waPhoneNumbers.phoneNumberId, params.phoneNumberId))
    .limit(1)

  if (!phoneRow[0]) return null

  console.log("[autoRegister] registered phone", params.phoneNumberId, "for WABA", params.wabaExternalId)

  return {
    phoneNumberRowId: phoneRow[0].id,
    orgId: waba.orgId,
    wabaId: waba.wabaId,
    accessTokenEnc: waba.accessTokenEnc,
    keyVersion: waba.keyVersion,
  }
}

/**
 * Resolves org+WABA context from a Meta phone_number_id (external string ID).
 * Used by the webhook to determine which tenant owns the inbound message.
 * The global unique index on phone_number_id guarantees one result maximum.
 */
export async function resolveTenantFromPhoneNumberId(
  phoneNumberId: string
): Promise<PhoneNumberTenant | null> {
  const rows = await db
    .select({
      phoneNumberRowId: waPhoneNumbers.id,
      orgId: waPhoneNumbers.orgId,
      wabaId: waBusinessAccounts.wabaId,
      accessTokenEnc: waBusinessAccounts.accessTokenEnc,
      keyVersion: waBusinessAccounts.keyVersion,
    })
    .from(waPhoneNumbers)
    .innerJoin(waBusinessAccounts, eq(waPhoneNumbers.wabaAccountId, waBusinessAccounts.id))
    .where(eq(waPhoneNumbers.phoneNumberId, phoneNumberId))
    .limit(1)

  return rows[0] ?? null
}

// ─── Conversation management ──────────────────────────────────────────────────

/**
 * Finds an active conversation for a given (phone_number_id, customer_phone) pair.
 * Creates one if it doesn't exist yet (upsert via unique constraint).
 */
export async function findOrCreateConversation(params: {
  orgId: string
  phoneNumberRowId: string
  customerPhone: string
  customerName?: string
  deploymentId?: string | null
}): Promise<string> {
  const existing = await db
    .select({ id: waConversations.id, deploymentId: waConversations.deploymentId })
    .from(waConversations)
    .where(
      and(
        eq(waConversations.orgId, params.orgId),
        eq(waConversations.phoneNumberId, params.phoneNumberRowId),
        eq(waConversations.customerPhone, params.customerPhone),
      )
    )
    .limit(1)

  if (existing[0]) {
    // Update customerName and/or backfill deploymentId if we now have them
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (params.customerName) updates.customerName = params.customerName
    if (params.deploymentId && !existing[0].deploymentId) updates.deploymentId = params.deploymentId
    if (Object.keys(updates).length > 1) {
      await db
        .update(waConversations)
        .set(updates as Parameters<ReturnType<typeof db.update>["set"]>[0])
        .where(eq(waConversations.id, existing[0].id))
        .catch(() => undefined)
    }
    return existing[0].id
  }

  const [created] = await db
    .insert(waConversations)
    .values({
      orgId: params.orgId,
      phoneNumberId: params.phoneNumberRowId,
      customerPhone: params.customerPhone,
      customerName: params.customerName ?? null,
      status: "active",
      controlMode: "ai",
      deploymentId: params.deploymentId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: waConversations.id })

  if (created) return created.id

  // Race: another request inserted simultaneously; re-fetch
  const retry = await db
    .select({ id: waConversations.id })
    .from(waConversations)
    .where(
      and(
        eq(waConversations.orgId, params.orgId),
        eq(waConversations.phoneNumberId, params.phoneNumberRowId),
        eq(waConversations.customerPhone, params.customerPhone),
      )
    )
    .limit(1)

  if (!retry[0]) throw new Error("wa-cloud: conversation insert race — both paths failed")
  return retry[0].id
}

// ─── Message persistence ──────────────────────────────────────────────────────

/**
 * Persists an inbound message and updates lastMessageAt on the conversation.
 * Deduplication: the unique index on external_message_id prevents double-inserts.
 */
export async function persistIncomingMessage(
  orgId: string,
  conversationId: string,
  msg: ParsedIncomingMessage,
): Promise<string | null> {
  const content = msg.textContent ?? msg.caption ?? msg.mediaId ?? ""

  const rows = await db
    .insert(waConversationMessages)
    .values({
      orgId,
      conversationId,
      direction: "inbound",
      role: "user",
      content,
      contentType: msg.type,
      externalMessageId: msg.wamid,
      status: "received",
      isAi: false,
    })
    .onConflictDoNothing()
    .returning({ id: waConversationMessages.id })

  const messageRowId = rows[0]?.id ?? null

  if (messageRowId) {
    await db
      .update(waConversations)
      .set({ lastMessageAt: msg.timestamp, updatedAt: new Date() })
      .where(and(eq(waConversations.id, conversationId), eq(waConversations.orgId, orgId)))
      .catch(() => undefined)
  }

  return messageRowId
}

/**
 * Persists an outbound message (sent by the agent or human operator).
 * Returns the internal message row ID.
 */
export async function persistOutboundMessage(params: {
  orgId: string
  conversationId: string
  content: string
  contentType?: string
  externalMessageId?: string
  isAi?: boolean
}): Promise<string | null> {
  const rows = await db
    .insert(waConversationMessages)
    .values({
      orgId: params.orgId,
      conversationId: params.conversationId,
      direction: "outbound",
      role: "assistant",
      content: params.content,
      contentType: params.contentType ?? "text",
      externalMessageId: params.externalMessageId ?? null,
      status: "sent",
      isAi: params.isAi ?? false,
    })
    .returning({ id: waConversationMessages.id })

  const messageRowId = rows[0]?.id ?? null

  if (messageRowId) {
    await db
      .update(waConversations)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(waConversations.id, params.conversationId),
          eq(waConversations.orgId, params.orgId),
        )
      )
      .catch(() => undefined)
  }

  return messageRowId
}

// ─── Delivery status updates ──────────────────────────────────────────────────

// Status ordering guard: prevents out-of-order webhook events from downgrading
// a message that has already reached a higher delivery state.
// Key = incoming status; Value = current statuses that should block the update.
// Examples: "sent" must not overwrite "delivered" or "read"; "failed" must not
// overwrite a successfully delivered or read message (Meta shouldn't send this,
// but guard defensively).
const STATUS_DOWNGRADE_GUARD: Record<string, string[]> = {
  sent: ["delivered", "read", "failed"],
  delivered: ["read", "failed"],
  read: ["failed"],
  failed: ["delivered", "read"],
}

/**
 * Updates a wa_conversation_messages row's status from a Meta delivery webhook.
 * Matches by external_message_id (wamid is globally unique per Meta's guarantee).
 * Applies a downgrade guard: out-of-order webhooks (e.g., "delivered" arriving
 * after "read") are silently ignored.
 */
export async function updateDeliveryStatusByWamid(
  stat: ParsedStatusUpdate,
): Promise<void> {
  const statusMap: Record<string, string> = {
    sent: "sent",
    delivered: "delivered",
    read: "read",
    failed: "failed",
  }
  const internalStatus = statusMap[stat.status] ?? "unknown"
  const blocked = STATUS_DOWNGRADE_GUARD[internalStatus] ?? []

  const whereClause =
    blocked.length > 0
      ? and(
          eq(waConversationMessages.externalMessageId, stat.wamid),
          notInArray(waConversationMessages.status, blocked),
        )
      : eq(waConversationMessages.externalMessageId, stat.wamid)

  await db
    .update(waConversationMessages)
    .set({ status: internalStatus })
    .where(whereClause)
    .catch(() => undefined)
}

/**
 * Updates delivery status scoped to a specific org (use when orgId is known).
 * Applies the same downgrade guard as updateDeliveryStatusByWamid.
 */
export async function updateMessageDeliveryStatus(
  orgId: string,
  stat: ParsedStatusUpdate,
): Promise<void> {
  const statusMap: Record<string, string> = {
    sent: "sent",
    delivered: "delivered",
    read: "read",
    failed: "failed",
  }
  const internalStatus = statusMap[stat.status] ?? "unknown"
  const blocked = STATUS_DOWNGRADE_GUARD[internalStatus] ?? []

  const whereClause =
    blocked.length > 0
      ? and(
          eq(waConversationMessages.orgId, orgId),
          eq(waConversationMessages.externalMessageId, stat.wamid),
          notInArray(waConversationMessages.status, blocked),
        )
      : and(
          eq(waConversationMessages.orgId, orgId),
          eq(waConversationMessages.externalMessageId, stat.wamid),
        )

  await db
    .update(waConversationMessages)
    .set({ status: internalStatus })
    .where(whereClause)
    .catch(() => undefined)
}

/**
 * Updates the status and optional wamid of an outbound message row.
 * Called after a send attempt to record the actual delivery state.
 */
export async function updateOutboundMessageStatus(
  messageRowId: string,
  orgId: string,
  update: { wamid?: string; status: string },
): Promise<void> {
  await db
    .update(waConversationMessages)
    .set({
      ...(update.wamid ? { externalMessageId: update.wamid } : {}),
      status: update.status,
    })
    .where(
      and(
        eq(waConversationMessages.id, messageRowId),
        eq(waConversationMessages.orgId, orgId),
      )
    )
    .catch(() => undefined)
}

// ─── AI message queue ─────────────────────────────────────────────────────────

const DEBOUNCE_MS = 3_000 // 3-second burst settling window

/**
 * Enqueues an incoming message for AI processing with burst debounce.
 *
 * claimAt is set DEBOUNCE_MS into the future so a rapid burst of messages
 * does not trigger parallel workers. After inserting the new item, all other
 * 'enqueued' items for the same conversation have their claimAt extended to
 * the same future time — the burst window resets with each new message.
 *
 * The cron worker's claim query filters `claim_at <= NOW()`, so debounced
 * items are simply not visible until the window expires.
 *
 * UNIQUE on incoming_message_id prevents duplicate queue entries from Meta
 * webhook retries.
 */
export async function enqueueForAiProcessing(params: {
  orgId: string
  conversationId: string
  incomingMessageId: string
}): Promise<void> {
  try {
    const claimAt = new Date(Date.now() + DEBOUNCE_MS)

    await db
      .insert(aiMessageQueue)
      .values({
        orgId: params.orgId,
        conversationId: params.conversationId,
        incomingMessageId: params.incomingMessageId,
        status: "enqueued",
        claimAt,
      })
      .onConflictDoNothing()

    // Extend debounce window for all pending items in the same conversation.
    // This ensures the burst settles before any item is eligible for claiming.
    await db
      .update(aiMessageQueue)
      .set({ claimAt, updatedAt: new Date() })
      .where(
        and(
          eq(aiMessageQueue.conversationId, params.conversationId),
          eq(aiMessageQueue.orgId, params.orgId),
          eq(aiMessageQueue.status, "enqueued"),
        )
      )
  } catch {
    // Non-fatal: webhook processing continues even if enqueue fails.
  }
}

// ─── Conversation reads ───────────────────────────────────────────────────────

export async function getConversationMessages(
  conversationId: string,
  orgId: string,
  limit = 50,
) {
  return db
    .select()
    .from(waConversationMessages)
    .where(
      and(
        eq(waConversationMessages.conversationId, conversationId),
        eq(waConversationMessages.orgId, orgId),
      )
    )
    .orderBy(desc(waConversationMessages.createdAt))
    .limit(limit)
}

export async function getConversationById(conversationId: string, orgId: string) {
  const rows = await db
    .select()
    .from(waConversations)
    .where(and(eq(waConversations.id, conversationId), eq(waConversations.orgId, orgId)))
    .limit(1)
  return rows[0] ?? null
}

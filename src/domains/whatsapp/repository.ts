import { db } from "@/lib/db"
import {
  waClientConfig,
  messageTemplates,
  waMessages,
  waProviderEvents,
  leads,
  leadActivities,
} from "@/lib/db/schema"
import { eq, and, desc, sql, isNull } from "drizzle-orm"
import type { WaClientConfigPublic, WaMessagePublic, WaMetrics, ProviderWebhookEvent } from "./types"
import type { WaMessageStatus, WaConfirmationMethod } from "@/lib/db/schema"
import crypto from "crypto"

// ─── Client Config ────────────────────────────────────────────────────────────

export async function getWaClientConfig(clientId: string, orgId: string): Promise<WaClientConfigPublic | null> {
  const rows = await db
    .select()
    .from(waClientConfig)
    .where(and(eq(waClientConfig.clientId, clientId), eq(waClientConfig.orgId, orgId)))
    .limit(1)
  const cfg = rows[0]
  if (!cfg) return null
  return {
    clientId: cfg.clientId,
    confirmationMode: cfg.confirmationMode,
    providerName: cfg.providerName,
    hasProvider: Boolean(cfg.providerConfigEnc),
  }
}

export async function upsertWaClientConfig(
  orgId: string,
  clientId: string,
  confirmationMode: WaConfirmationMethod,
  providerName?: string | null,
) {
  const rows = await db
    .insert(waClientConfig)
    .values({
      orgId,
      clientId,
      confirmationMode,
      providerName: providerName ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: waClientConfig.clientId,
      set: {
        confirmationMode,
        providerName: providerName ?? null,
        updatedAt: new Date(),
      },
    })
    .returning()
  return rows[0]!
}

// ─── Message Templates ────────────────────────────────────────────────────────

export async function listMessageTemplates(orgId: string, clientId: string, campaignId?: string | null) {
  const conditions = [
    eq(messageTemplates.orgId, orgId),
    eq(messageTemplates.clientId, clientId),
    eq(messageTemplates.active, true),
  ]
  return db
    .select()
    .from(messageTemplates)
    .where(and(...conditions))
    .orderBy(messageTemplates.isDefault, messageTemplates.name)
}

export async function createMessageTemplate(
  orgId: string,
  data: {
    clientId: string
    campaignId?: string | null
    name: string
    content: string
    allowedVariables: string[]
    isDefault: boolean
    createdById: string
  }
) {
  const rows = await db
    .insert(messageTemplates)
    .values({ orgId, ...data })
    .returning()
  return rows[0]!
}

export async function updateMessageTemplate(
  id: string,
  orgId: string,
  data: Partial<{
    name: string
    content: string
    allowedVariables: string[]
    isDefault: boolean
    active: boolean
    campaignId: string | null
  }>
) {
  const rows = await db
    .update(messageTemplates)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(messageTemplates.id, id), eq(messageTemplates.orgId, orgId)))
    .returning()
  return rows[0] ?? null
}

// ─── wa.me link generation (server-side) ──────────────────────────────────────

/**
 * Interpola variables seguras en el contenido del template.
 * Solo variables en allowedVariables son sustituidas; las demás se dejan tal cual.
 * El resultado se escapa para uso en URL.
 */
export function buildWaLink(phone: string, content: string): string {
  // Sanitize phone: remove any character that is not a digit or leading +
  const clean = phone.replace(/[^\d+]/g, "")
  const encoded = encodeURIComponent(content)
  return `https://wa.me/${clean}?text=${encoded}`
}

export function interpolateTemplate(
  content: string,
  allowedVariables: string[],
  variables: Record<string, string>,
): string {
  let result = content
  for (const key of allowedVariables) {
    const value = variables[key]
    if (value !== undefined) {
      // Escape HTML entities to prevent injection in the preview
      const safe = String(value).replace(/[<>&"']/g, (c) => ({
        "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;",
      }[c] ?? c))
      result = result.replaceAll(`{{${key}}}`, safe)
    }
  }
  return result
}

// ─── WhatsApp Messages ────────────────────────────────────────────────────────

export async function createWaLinkRecord(params: {
  orgId: string
  leadId: string
  assignmentId: string | null
  templateId: string | null
  sentById: string
  salesRepId: string | null
  confirmationMode: WaConfirmationMethod
}): Promise<WaMessagePublic> {
  const rows = await db
    .insert(waMessages)
    .values({
      ...params,
      status: "link_prepared",
      linkOpenedAt: new Date(),
    })
    .returning()
  const row = rows[0]!

  await db.insert(leadActivities).values({
    leadId: params.leadId,
    orgId: params.orgId,
    actorId: params.sentById,
    actorType: "user",
    activityType: "wa_link_prepared",
    metadata: {
      waMessageId: row.id,
      confirmationMode: params.confirmationMode,
      salesRepId: params.salesRepId,
    },
  }).catch(() => undefined)

  return toPublic(row)
}

export async function markMessageShared(
  messageId: string,
  orgId: string,
  confirmedById: string,
  note?: string | null,
): Promise<WaMessagePublic> {
  const rows = await db
    .update(waMessages)
    .set({
      status: "marked_shared",
      confirmedById,
      confirmedAt: new Date(),
      note: note ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(waMessages.id, messageId),
        eq(waMessages.orgId, orgId),
        eq(waMessages.confirmationMode, "manual"),
      )
    )
    .returning()
  if (!rows[0]) throw new Error("Mensaje no encontrado o modo de confirmación incorrecto")

  await db.insert(leadActivities).values({
    leadId: rows[0].leadId,
    orgId,
    actorId: confirmedById,
    actorType: "user",
    activityType: "wa_marked_shared",
    metadata: { waMessageId: messageId, note: note ?? null },
  }).catch(() => undefined)

  return toPublic(rows[0])
}

export async function correctManualConfirmation(
  messageId: string,
  orgId: string,
  correctedById: string,
  reason: string,
): Promise<WaMessagePublic> {
  const rows = await db
    .update(waMessages)
    .set({
      status: "link_prepared",
      correctedAt: new Date(),
      correctedById,
      correctionReason: reason,
      confirmedById: null,
      confirmedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(waMessages.id, messageId),
        eq(waMessages.orgId, orgId),
        eq(waMessages.status, "marked_shared"),
      )
    )
    .returning()
  if (!rows[0]) throw new Error("Solo se pueden corregir confirmaciones en estado marked_shared")

  await db.insert(leadActivities).values({
    leadId: rows[0].leadId,
    orgId,
    actorId: correctedById,
    actorType: "user",
    activityType: "wa_correction",
    metadata: { waMessageId: messageId, reason },
  }).catch(() => undefined)

  return toPublic(rows[0])
}

export async function markLeadContactedInternal(
  leadId: string,
  orgId: string,
  actorId: string,
  note?: string | null,
) {
  const now = new Date()
  // Update lead contact timestamps
  await db
    .update(leads)
    .set({
      firstContactedAt: sql`COALESCE(first_contacted_at, ${now})`,
      lastContactedAt: now,
      updatedAt: now,
    })
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))

  await db.insert(leadActivities).values({
    leadId,
    orgId,
    actorId,
    actorType: "user",
    activityType: "wa_contacted",
    metadata: { note: note ?? null },
  }).catch(() => undefined)
}

export async function getWaMessages(leadId: string, orgId: string): Promise<WaMessagePublic[]> {
  const rows = await db
    .select()
    .from(waMessages)
    .where(and(eq(waMessages.leadId, leadId), eq(waMessages.orgId, orgId)))
    .orderBy(desc(waMessages.createdAt))
  return rows.map(toPublic)
}

// ─── Provider webhook processing ─────────────────────────────────────────────

export async function processProviderEvent(params: {
  orgId: string
  clientId: string
  providerName: string
  event: ProviderWebhookEvent
}) {
  const { orgId, clientId, providerName, event } = params
  const dedupeKey = crypto
    .createHash("sha256")
    .update(`${providerName}:${event.externalMessageId}:${event.providerStatus}`)
    .digest("hex")

  // Idempotent: skip if already processed
  const existing = await db
    .select({ id: waProviderEvents.id })
    .from(waProviderEvents)
    .where(eq(waProviderEvents.dedupeKey, dedupeKey))
    .limit(1)
  if (existing.length > 0) return { skipped: true }

  // Find the wa_message by externalMessageId
  const [waMsg] = await db
    .select()
    .from(waMessages)
    .where(
      and(
        eq(waMessages.externalMessageId, event.externalMessageId),
        eq(waMessages.orgId, orgId),
      )
    )
    .limit(1)

  // Record the provider event (insert first for idempotency, ignore FK-unresolved)
  await db.insert(waProviderEvents).values({
    orgId,
    clientId,
    waMessageId: waMsg?.id ?? null,
    externalMessageId: event.externalMessageId,
    providerName,
    eventType: event.providerStatus,
    statusRaw: event.providerStatus,
    dedupeKey,
    processedAt: event.occurredAt,
  })

  if (!waMsg || !event.normalizedStatus) return { skipped: false, updated: false }

  // Map normalized status to timestamp column
  const now = event.occurredAt
  const update: Record<string, unknown> = {
    status: event.normalizedStatus,
    providerStatusRaw: event.providerStatus,
    updatedAt: new Date(),
  }
  if (event.normalizedStatus === "provider_accepted") update.providerAcceptedAt = now
  if (event.normalizedStatus === "sent") update.providerSentAt = now
  if (event.normalizedStatus === "delivered") update.providerDeliveredAt = now
  if (event.normalizedStatus === "read") update.providerReadAt = now
  if (event.normalizedStatus === "failed") { update.failedAt = now; update.failureReason = event.providerStatus }

  await db.update(waMessages).set(update).where(eq(waMessages.id, waMsg.id))

  await db.insert(leadActivities).values({
    leadId: waMsg.leadId,
    orgId,
    actorId: null,
    actorType: "api",
    activityType: "wa_provider_update",
    metadata: {
      waMessageId: waMsg.id,
      providerName,
      status: event.normalizedStatus,
      providerStatus: event.providerStatus,
    },
  }).catch(() => undefined)

  return { skipped: false, updated: true }
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export async function getWaMetrics(orgId: string, clientId?: string): Promise<WaMetrics> {
  // We use raw SQL aggregation for efficiency
  const conditions = clientId
    ? sql`wm.org_id = ${orgId} AND l.campaign_id IN (
        SELECT id FROM campaigns WHERE client_id = ${clientId}
      )`
    : sql`wm.org_id = ${orgId}`

  const [row] = await db.execute<{
    link_prepared: string
    marked_shared: string
    provider_confirmed: string
    delivered: string
    read_count: string
    contacted: string
    failed_count: string
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE wm.status = 'link_prepared')                       AS link_prepared,
      COUNT(*) FILTER (WHERE wm.status = 'marked_shared')                       AS marked_shared,
      COUNT(*) FILTER (WHERE wm.status IN ('provider_accepted','sent') AND wm.confirmation_mode = 'provider') AS provider_confirmed,
      COUNT(*) FILTER (WHERE wm.status = 'delivered')                           AS delivered,
      COUNT(*) FILTER (WHERE wm.status = 'read')                                AS read_count,
      COUNT(*) FILTER (WHERE wm.status = 'contacted')                           AS contacted,
      COUNT(*) FILTER (WHERE wm.status = 'failed')                              AS failed_count
    FROM wa_messages wm
    JOIN leads l ON l.id = wm.lead_id
    WHERE ${conditions}
  `) as unknown as Array<{
    link_prepared: string; marked_shared: string; provider_confirmed: string;
    delivered: string; read_count: string; contacted: string; failed_count: string
  }>

  // Assignments count
  const [assigned] = await db.execute<{ cnt: string }>(sql`
    SELECT COUNT(*) AS cnt
    FROM lead_assignments la
    JOIN leads l ON l.id = la.lead_id
    WHERE la.org_id = ${orgId}
      AND la.is_current = true
      ${clientId ? sql`AND l.campaign_id IN (SELECT id FROM campaigns WHERE client_id = ${clientId})` : sql``}
  `) as unknown as Array<{ cnt: string }>

  return {
    assigned: Number(assigned?.cnt ?? 0),
    linksPrepared: Number(row?.link_prepared ?? 0),
    markedShared: Number(row?.marked_shared ?? 0),
    providerConfirmed: Number(row?.provider_confirmed ?? 0),
    delivered: Number(row?.delivered ?? 0),
    read: Number(row?.read_count ?? 0),
    contacted: Number(row?.contacted ?? 0),
    failed: Number(row?.failed_count ?? 0),
    avgMinutesAssignToSend: null,   // TODO: compute with EXTRACT(EPOCH...)
    avgMinutesAssignToContact: null,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPublic(row: typeof waMessages.$inferSelect): WaMessagePublic {
  return {
    id: row.id,
    leadId: row.leadId,
    status: row.status,
    confirmationMode: row.confirmationMode,
    providerName: row.providerName,
    confirmedAt: row.confirmedAt,
    correctedAt: row.correctedAt,
    note: row.note,
    linkOpenedAt: row.linkOpenedAt,
    providerSentAt: row.providerSentAt,
    providerDeliveredAt: row.providerDeliveredAt,
    providerReadAt: row.providerReadAt,
    failedAt: row.failedAt,
    failureReason: row.failureReason,
    salesRepId: row.salesRepId,
    createdAt: row.createdAt,
  }
}

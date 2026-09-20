import { db } from "@/lib/db"
import { conversions, metaEvents, leads, leadStageHistory } from "@/lib/db/schema"
import { and, eq, desc } from "drizzle-orm"
import type { Conversion, MetaEvent } from "@/lib/db/schema"
import type { PurchaseEvent } from "./payload"

// ─── Conversions ─────────────────────────────────────────────────────────────

export async function createConversionIdempotent(data: {
  orgId: string
  leadId: string
  campaignId: string | null
  orderId: string
  amount: string
  currency: string
  convertedAt: Date
  actorId: string
  notes?: string | null
}): Promise<{ conversion: Conversion; created: boolean }> {
  const [inserted] = await db
    .insert(conversions)
    .values({
      orgId: data.orgId,
      leadId: data.leadId,
      campaignId: data.campaignId,
      orderId: data.orderId,
      amount: data.amount,
      currency: data.currency,
      status: "confirmed",
      convertedAt: data.convertedAt,
      actorId: data.actorId,
      notes: data.notes ?? null,
    })
    .onConflictDoNothing()
    .returning()

  if (inserted) return { conversion: inserted, created: true }

  // Duplicate — return the existing row
  const existing = await db.query.conversions.findFirst({
    where: and(eq(conversions.orgId, data.orgId), eq(conversions.orderId, data.orderId)),
  })
  return { conversion: existing!, created: false }
}

export async function getConversionByLeadId(
  leadId: string,
  orgId: string
): Promise<Conversion | undefined> {
  return db.query.conversions.findFirst({
    where: and(eq(conversions.leadId, leadId), eq(conversions.orgId, orgId)),
    orderBy: (c, { desc }) => [desc(c.createdAt)],
  })
}

export async function getConversionsByLeadId(
  leadId: string,
  orgId: string
): Promise<Conversion[]> {
  return db.query.conversions.findMany({
    where: and(eq(conversions.leadId, leadId), eq(conversions.orgId, orgId)),
    orderBy: (c, { desc }) => [desc(c.convertedAt)],
  })
}

export async function getConversionById(
  conversionId: string,
  orgId: string
): Promise<Conversion | undefined> {
  return db.query.conversions.findFirst({
    where: and(eq(conversions.id, conversionId), eq(conversions.orgId, orgId)),
  })
}

export async function cancelConversion(
  conversionId: string,
  orgId: string,
  cancelReason: string
): Promise<void> {
  await db
    .update(conversions)
    .set({ status: "cancelled", cancelledAt: new Date(), cancelReason, updatedAt: new Date() })
    .where(and(eq(conversions.id, conversionId), eq(conversions.orgId, orgId)))
}

// ─── Meta Events ─────────────────────────────────────────────────────────────

export async function createMetaEventIdempotent(data: {
  orgId: string
  leadId: string
  conversionId: string
  pixelId: string
  event: PurchaseEvent
}): Promise<{ metaEvent: MetaEvent; created: boolean }> {
  const eventId = data.event.event_id

  const [inserted] = await db
    .insert(metaEvents)
    .values({
      orgId: data.orgId,
      leadId: data.leadId,
      conversionId: data.conversionId,
      pixelId: data.pixelId,
      eventName: "Purchase",
      eventId,
      payloadVersion: 1,
      payload: data.event as unknown as Record<string, unknown>,
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: new Date(), // immediately eligible
    })
    .onConflictDoNothing()
    .returning()

  if (inserted) return { metaEvent: inserted, created: true }

  const existing = await db.query.metaEvents.findFirst({
    where: eq(metaEvents.eventId, eventId),
  })
  return { metaEvent: existing!, created: false }
}

export async function getMetaEventByConversionId(
  conversionId: string,
  orgId: string
): Promise<MetaEvent | undefined> {
  return db.query.metaEvents.findFirst({
    where: and(eq(metaEvents.conversionId, conversionId), eq(metaEvents.orgId, orgId)),
    orderBy: (e, { desc }) => [desc(e.createdAt)],
  })
}

export async function resetMetaEventForRetry(
  metaEventId: string,
  orgId: string
): Promise<void> {
  await db
    .update(metaEvents)
    .set({
      status: "pending",
      nextAttemptAt: new Date(),
      lockedUntil: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(metaEvents.id, metaEventId),
        eq(metaEvents.orgId, orgId),
        // Only reset if not already sent
      )
    )
}

export async function cancelPendingMetaEvents(
  conversionId: string,
  orgId: string
): Promise<void> {
  // Cancel events that haven't been sent yet
  await db
    .update(metaEvents)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(metaEvents.conversionId, conversionId),
        eq(metaEvents.orgId, orgId),
      )
    )
}

// ─── Lead deprecated-field sync ───────────────────────────────────────────────
// Updates the deprecated leads.converted / leads.stage columns so existing UI
// still shows conversion data while the v2 conversions table is the source of truth.

export async function syncLeadConvertedFields(
  leadId: string,
  orgId: string,
  amount: string,
  currency: string,
  convertedAt: Date,
  changedBy: string
): Promise<void> {
  const current = await db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), eq(leads.orgId, orgId)),
    columns: { stage: true, converted: true },
  })
  if (!current || current.converted) return // already synced

  await Promise.all([
    db.update(leads)
      .set({
        converted: true,
        conversionAmount: amount,
        conversionCurrency: currency,
        conversionDate: convertedAt,
        stage: "won",
        updatedAt: new Date(),
      })
      .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId))),
    db.insert(leadStageHistory).values({
      leadId, orgId,
      field: "stage",
      fromValue: current.stage,
      toValue: "won",
      changedBy,
    }),
    db.insert(leadStageHistory).values({
      leadId, orgId,
      field: "converted",
      fromValue: "false",
      toValue: "true",
      changedBy,
    }),
  ])
}

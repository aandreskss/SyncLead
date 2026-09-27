"use server"

import { db } from "@/lib/db"
import { metaEvents, importBatches, cronRuns, leads, campaigns } from "@/lib/db/schema"
import { and, eq, inArray, isNotNull, isNull, lt, notLike, or } from "drizzle-orm"
import { requireRole, requireClientAccess } from "@/lib/auth/server"
import { writeAuditLog } from "@/lib/audit"
import { getClientMetaEvents, getOrgMetaEvents, type ClientMetaEventRow } from "./repository"
import { sendMetaEventDirect } from "@/lib/meta-outbox/worker"

const ADMIN_ROLES = ["owner", "admin"] as const

// ─── CAPI retry (org-wide) ────────────────────────────────────────────────────

export async function retryFailedCapiEventsAction() {
  let ctx
  try {
    ctx = await requireRole([...ADMIN_ROLES])
  } catch {
    return { error: "No autorizado" }
  }

  const now = new Date()

  const updated = await db
    .update(metaEvents)
    .set({
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: null,
      lockedUntil: null,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(metaEvents.orgId, ctx.orgId),
        eq(metaEvents.status, "failed"),
      )
    )

  const count = updated.rowCount ?? 0

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "capi.retry_failed",
    resourceType: "meta_events",
    metadata: { count },
  }).catch(() => undefined)

  return { success: true, count }
}

// ─── CAPI retry per client ────────────────────────────────────────────────────

export async function retryFailedCapiForClientAction(
  clientId: string
): Promise<{ success: true; count: number } | { error: string }> {
  let ctx
  try {
    ctx = await requireClientAccess(clientId)
  } catch {
    return { error: "No autorizado" }
  }

  const campaignRows = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.clientId, clientId), eq(campaigns.orgId, ctx.orgId)))

  if (campaignRows.length === 0) return { success: true, count: 0 }
  const campaignIds = campaignRows.map((c) => c.id)

  const leadRows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(inArray(leads.campaignId, campaignIds), eq(leads.orgId, ctx.orgId)))

  if (leadRows.length === 0) return { success: true, count: 0 }
  const leadIds = leadRows.map((l) => l.id)

  const now = new Date()

  const updated = await db
    .update(metaEvents)
    .set({
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: now,
      lockedUntil: null,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(metaEvents.orgId, ctx.orgId),
        eq(metaEvents.status, "failed"),
        inArray(metaEvents.leadId, leadIds),
        notLike(metaEvents.lastError, "%code:190%"),
        notLike(metaEvents.lastError, "%code:102%"),
      )
    )

  const count = updated.rowCount ?? 0

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "capi.retry_failed_client",
    resourceType: "meta_events",
    metadata: { clientId, count },
  }).catch(() => undefined)

  return { success: true, count }
}

// ─── Send single CAPI event directly ─────────────────────────────────────────

export async function sendSingleCapiEventAction(
  eventId: string
): Promise<{ success: true; status: string } | { error: string }> {
  let ctx
  try {
    ctx = await requireRole([...ADMIN_ROLES])
  } catch {
    return { error: "No autorizado" }
  }

  const result = await sendMetaEventDirect(eventId, ctx.orgId).catch(() => ({ sent: false, status: "error" }))
  return { success: true, status: result.status }
}

// ─── Cancel orphan CAPI events (lead deleted) ─────────────────────────────────

export async function cancelOrphanCapiEventsAction(): Promise<
  { success: true; count: number } | { error: string }
> {
  let ctx
  try {
    ctx = await requireRole([...ADMIN_ROLES])
  } catch {
    return { error: "No autorizado" }
  }

  // Orphans: leadId is set but the lead row no longer exists
  const orphanEvents = await db
    .select({ id: metaEvents.id })
    .from(metaEvents)
    .leftJoin(leads, eq(metaEvents.leadId, leads.id))
    .where(
      and(
        eq(metaEvents.orgId, ctx.orgId),
        isNotNull(metaEvents.leadId),
        isNull(leads.id),
        or(eq(metaEvents.status, "pending"), eq(metaEvents.status, "retrying"))
      )
    )

  if (orphanEvents.length === 0) return { success: true, count: 0 }

  await db
    .update(metaEvents)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(inArray(metaEvents.id, orphanEvents.map((e) => e.id)))

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "capi.cancel_orphans",
    resourceType: "meta_events",
    metadata: { count: orphanEvents.length },
  }).catch(() => undefined)

  return { success: true, count: orphanEvents.length }
}

// ─── CAPI event log action (org-wide, optionally filtered by client) ──────────

export async function getOrgMetaEventsAction(
  clientId?: string,
  limit?: number
): Promise<{ data: ClientMetaEventRow[] } | { error: string }> {
  let ctx
  try {
    ctx = await requireRole([...ADMIN_ROLES])
  } catch {
    return { error: "No autorizado" }
  }

  const data = await getOrgMetaEvents(ctx.orgId, clientId, limit ?? 100)
  return { data }
}

// ─── CAPI event log action (per client) ──────────────────────────────────────

export async function getClientMetaEventsAction(
  clientId: string,
  limit?: number
): Promise<{ data: ClientMetaEventRow[] } | { error: string }> {
  let ctx
  try {
    ctx = await requireClientAccess(clientId)
  } catch {
    return { error: "No autorizado" }
  }

  const data = await getClientMetaEvents(ctx.orgId, clientId, limit ?? 50)
  return { data }
}

// ─── Import retry ─────────────────────────────────────────────────────────────

export async function retryFailedImportAction(batchId: string) {
  let ctx
  try {
    ctx = await requireRole([...ADMIN_ROLES, "manager"])
  } catch {
    return { error: "No autorizado" }
  }

  const batch = await db.query.importBatches.findFirst({
    where: and(
      eq(importBatches.id, batchId),
      eq(importBatches.orgId, ctx.orgId),
      inArray(importBatches.status, ["failed"])
    ),
  })

  if (!batch) return { error: "Batch no encontrado o no está en estado fallido" }

  await db
    .update(importBatches)
    .set({ status: "pending", updatedAt: new Date() })
    .where(and(eq(importBatches.id, batchId), eq(importBatches.orgId, ctx.orgId)))

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "import.retry_failed",
    resourceType: "import_batch",
    resourceId: batchId,
  }).catch(() => undefined)

  return { success: true }
}

// ─── Cron run cleanup ─────────────────────────────────────────────────────────

export async function resolveStuckCronRunsAction() {
  let ctx
  try {
    ctx = await requireRole([...ADMIN_ROLES])
  } catch {
    return { error: "No autorizado" }
  }

  const cutoff = new Date(Date.now() - 10 * 60 * 1000)

  const updated = await db
    .update(cronRuns)
    .set({ status: "timeout", completedAt: new Date(), error: "resolved_manually" })
    .where(
      and(
        eq(cronRuns.status, "running"),
        lt(cronRuns.startedAt, cutoff)
      )
    )

  const count = updated.rowCount ?? 0

  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "cron.resolve_stuck",
    resourceType: "cron_runs",
    metadata: { count },
  }).catch(() => undefined)

  return { success: true, count }
}

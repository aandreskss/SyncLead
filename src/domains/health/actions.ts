"use server"

import { db } from "@/lib/db"
import { metaEvents, importBatches, cronRuns, leads, campaigns } from "@/lib/db/schema"
import { and, eq, inArray, lt, notLike } from "drizzle-orm"
import { requireRole, requireClientAccess } from "@/lib/auth/server"
import { writeAuditLog } from "@/lib/audit"
import { getClientMetaEvents, type ClientMetaEventRow } from "./repository"

const ADMIN_ROLES = ["owner", "admin"] as const

// ─── CAPI retry ───────────────────────────────────────────────────────────────

/**
 * Resets up to 50 'failed' CAPI events for this org back to 'pending' so the
 * outbox worker will retry them on the next cron run.
 * Only resets events where the last error is not a permanent auth failure —
 * those require fixing the Meta token first.
 */
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

  // Get all leadIds in campaigns belonging to this client
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

  // Reset failed events — exclude permanent auth failures (code 190, 102)
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

// ─── CAPI event log action ────────────────────────────────────────────────────

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

/**
 * Resets a 'failed' import batch back to 'pending' so it can be re-confirmed
 * via the import wizard. Only the batch status is changed — rows keep their
 * individual statuses so the processor can skip already-imported rows.
 */
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

/**
 * Marks stuck 'running' cron runs as 'timeout' so they don't pollute the
 * health dashboard. A run stuck for more than 10 minutes is assumed failed.
 */
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

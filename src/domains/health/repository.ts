import "server-only"
import { db } from "@/lib/db"
import {
  metaConnections,
  metaEvents,
  metaSyncRuns,
  importBatches,
  cronRuns,
  clients,
} from "@/lib/db/schema"
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm"

// ─── DB Ping ──────────────────────────────────────────────────────────────────

export async function pingDatabase(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now()
  try {
    await db.execute(sql`SELECT 1`)
    return { ok: true, latencyMs: Date.now() - start }
  } catch {
    return { ok: false, latencyMs: Date.now() - start }
  }
}

// ─── Meta Connections ─────────────────────────────────────────────────────────

export interface MetaConnectionHealth {
  connectionId: string
  clientId: string | null
  clientName: string | null
  adAccountId: string | null
  status: string
  lastSyncAt: Date | null
  lastSyncStatus: string | null
  lastSyncError: string | null
}

export async function getMetaConnectionsHealth(orgId: string): Promise<MetaConnectionHealth[]> {
  const connections = await db
    .select({
      connectionId: metaConnections.id,
      clientId: metaConnections.clientId,
      clientName: clients.name,
      adAccountId: metaConnections.adAccountId,
      status: metaConnections.status,
    })
    .from(metaConnections)
    .leftJoin(clients, eq(metaConnections.clientId, clients.id))
    .where(eq(metaConnections.orgId, orgId))

  if (connections.length === 0) return []

  // Fetch the latest sync run per ad account
  const accountIds = connections
    .map((c) => c.adAccountId)
    .filter((id): id is string => id !== null)

  const latestSyncs =
    accountIds.length > 0
      ? await db
          .select({
            adAccountId: metaSyncRuns.adAccountId,
            completedAt: metaSyncRuns.completedAt,
            status: metaSyncRuns.status,
            error: metaSyncRuns.error,
          })
          .from(metaSyncRuns)
          .where(
            and(
              eq(metaSyncRuns.orgId, orgId),
              inArray(metaSyncRuns.adAccountId, accountIds)
            )
          )
          .orderBy(desc(metaSyncRuns.startedAt))
          .limit(accountIds.length * 3)
      : []

  // Keep only the most recent sync per adAccountId
  const syncByAccount = new Map<string, (typeof latestSyncs)[number]>()
  for (const s of latestSyncs) {
    if (s.adAccountId && !syncByAccount.has(s.adAccountId)) {
      syncByAccount.set(s.adAccountId, s)
    }
  }

  return connections.map((c) => {
    const sync = c.adAccountId ? syncByAccount.get(c.adAccountId) : undefined
    return {
      connectionId: c.connectionId,
      clientId: c.clientId,
      clientName: c.clientName,
      adAccountId: c.adAccountId,
      status: c.status,
      lastSyncAt: sync?.completedAt ?? null,
      lastSyncStatus: sync?.status ?? null,
      lastSyncError: sync?.error ?? null,
    }
  })
}

// ─── CAPI Queue ───────────────────────────────────────────────────────────────

export interface CapiQueueStats {
  pending: number
  processing: number
  retrying: number
  sent: number
  failed: number
  skipped: number
  cancelled: number
  total: number
}

export async function getCapiQueueStats(orgId: string): Promise<CapiQueueStats> {
  const rows = await db
    .select({
      status: metaEvents.status,
      count: sql<number>`count(*)::int`,
    })
    .from(metaEvents)
    .where(eq(metaEvents.orgId, orgId))
    .groupBy(metaEvents.status)

  const stats: CapiQueueStats = {
    pending: 0, processing: 0, retrying: 0,
    sent: 0, failed: 0, skipped: 0, cancelled: 0, total: 0,
  }
  for (const r of rows) {
    const key = r.status as keyof CapiQueueStats
    if (key in stats) stats[key] = r.count
    stats.total += r.count
  }
  return stats
}

// ─── Import Batches ───────────────────────────────────────────────────────────

export interface ImportBatchHealth {
  batchId: string
  clientId: string | null
  campaignId: string | null
  status: string
  totalRows: number
  importedRows: number
  failedRows: number
  skippedRows: number
  createdAt: Date
  originalFilename: string | null
}

export async function getActiveImports(orgId: string, limit = 10): Promise<ImportBatchHealth[]> {
  const rows = await db
    .select({
      id: importBatches.id,
      clientId: importBatches.clientId,
      campaignId: importBatches.campaignId,
      status: importBatches.status,
      totalRows: importBatches.totalRows,
      importedRows: importBatches.processedRows,
      failedRows: importBatches.failedRows,
      skippedRows: importBatches.skippedRows,
      createdAt: importBatches.createdAt,
      originalFilename: importBatches.originalFilename,
    })
    .from(importBatches)
    .where(
      and(
        eq(importBatches.orgId, orgId),
        inArray(importBatches.status, ["processing", "failed", "dry_run"])
      )
    )
    .orderBy(desc(importBatches.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    batchId: r.id,
    clientId: r.clientId,
    campaignId: r.campaignId,
    status: r.status,
    totalRows: r.totalRows ?? 0,
    importedRows: r.importedRows ?? 0,
    failedRows: r.failedRows ?? 0,
    skippedRows: r.skippedRows ?? 0,
    createdAt: r.createdAt,
    originalFilename: r.originalFilename,
  }))
}

// ─── Cron Runs History ────────────────────────────────────────────────────────

export interface CronRunSummary {
  id: string
  jobName: string
  correlationId: string
  status: string
  startedAt: Date
  durationMs: number | null
  itemsProcessed: number
  itemsFailed: number
  error: string | null
}

export async function getRecentCronRuns(limit = 30): Promise<CronRunSummary[]> {
  const rows = await db
    .select({
      id: cronRuns.id,
      jobName: cronRuns.jobName,
      correlationId: cronRuns.correlationId,
      status: cronRuns.status,
      startedAt: cronRuns.startedAt,
      durationMs: cronRuns.durationMs,
      itemsProcessed: cronRuns.itemsProcessed,
      itemsFailed: cronRuns.itemsFailed,
      error: cronRuns.error,
    })
    .from(cronRuns)
    .orderBy(desc(cronRuns.startedAt))
    .limit(limit)

  return rows
}

export async function getStuckCronRuns(stuckAfterMs = 5 * 60 * 1000): Promise<CronRunSummary[]> {
  const cutoff = new Date(Date.now() - stuckAfterMs)
  const rows = await db
    .select({
      id: cronRuns.id,
      jobName: cronRuns.jobName,
      correlationId: cronRuns.correlationId,
      status: cronRuns.status,
      startedAt: cronRuns.startedAt,
      durationMs: cronRuns.durationMs,
      itemsProcessed: cronRuns.itemsProcessed,
      itemsFailed: cronRuns.itemsFailed,
      error: cronRuns.error,
    })
    .from(cronRuns)
    .where(and(eq(cronRuns.status, "running"), sql`${cronRuns.startedAt} < ${cutoff}`))

  return rows
}

// ─── Composite snapshot ───────────────────────────────────────────────────────

export interface HealthSnapshot {
  db: Awaited<ReturnType<typeof pingDatabase>>
  metaConnections: MetaConnectionHealth[]
  capiQueue: CapiQueueStats
  activeImports: ImportBatchHealth[]
  recentCronRuns: CronRunSummary[]
  stuckCronRuns: CronRunSummary[]
}

export async function getHealthSnapshot(orgId: string): Promise<HealthSnapshot> {
  const [dbPing, connections, capi, imports, cronHistory, stuckCrons] = await Promise.all([
    pingDatabase(),
    getMetaConnectionsHealth(orgId),
    getCapiQueueStats(orgId),
    getActiveImports(orgId),
    getRecentCronRuns(30),
    getStuckCronRuns(),
  ])

  return {
    db: dbPing,
    metaConnections: connections,
    capiQueue: capi,
    activeImports: imports,
    recentCronRuns: cronHistory,
    stuckCronRuns: stuckCrons,
  }
}

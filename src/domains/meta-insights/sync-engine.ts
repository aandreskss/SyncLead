import "server-only"

import { db } from "@/lib/db"
import { adInsightsDaily, metaSyncRuns } from "@/lib/db/schema"
import { and, eq, gt, isNotNull, desc } from "drizzle-orm"
import { MetaAdsClient } from "@/lib/meta-ads/client"
import { parseMetaSpend, extractLeadActions } from "./kpi"
import { syncAdCatalog } from "./catalog-sync"

const LOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes

function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function dateRange(syncType: "initial" | "incremental" | "manual", opts: { dateFrom?: string; dateTo?: string }): { dateFrom: string; dateTo: string } {
  if (syncType === "manual" && opts.dateFrom && opts.dateTo) {
    return { dateFrom: opts.dateFrom, dateTo: opts.dateTo }
  }
  if (syncType === "initial") {
    return { dateFrom: daysAgo(90), dateTo: today() }
  }
  // incremental: last 7 days (ensures any delayed Meta data is captured)
  return { dateFrom: daysAgo(7), dateTo: today() }
}

/**
 * Check for a running sync with a non-expired lock.
 * Returns true if another instance is running.
 */
async function isLocked(orgId: string, adAccountId: string): Promise<boolean> {
  const running = await db.query.metaSyncRuns.findFirst({
    where: and(
      eq(metaSyncRuns.orgId, orgId),
      eq(metaSyncRuns.adAccountId, adAccountId),
      eq(metaSyncRuns.status, "running"),
      gt(metaSyncRuns.lockedUntil, new Date()),
    ),
  })
  return !!running
}

export interface SyncOptions {
  connectionId: string
  orgId: string
  clientId: string
  adAccountId: string
  accessToken: string
  graphApiVersion?: string
  syncType?: "initial" | "incremental" | "manual"
  dateFrom?: string
  dateTo?: string
}

export interface SyncResult {
  runId: string
  recordsSynced: number
  error?: string
}

export async function runInsightsSync(opts: SyncOptions): Promise<SyncResult> {
  const {
    orgId, clientId, adAccountId,
    accessToken, graphApiVersion,
    syncType = "incremental",
    dateFrom: customFrom,
    dateTo: customTo,
  } = opts

  // Prevent concurrent syncs for the same account
  if (await isLocked(orgId, adAccountId)) {
    return { runId: "", recordsSynced: 0, error: "sync_already_running" }
  }

  const { dateFrom, dateTo } = dateRange(syncType, { dateFrom: customFrom, dateTo: customTo })
  const lockOwner = crypto.randomUUID()
  const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS)

  const [run] = await db
    .insert(metaSyncRuns)
    .values({
      orgId,
      clientId,
      adAccountId,
      status: "running",
      syncType,
      dateFrom,
      dateTo,
      recordsSynced: 0,
      lockedUntil,
      lockedBy: lockOwner,
    })
    .returning()

  if (!run) return { runId: "", recordsSynced: 0, error: "failed_to_create_run" }

  const apiClient = new MetaAdsClient({ accessToken, adAccountId, apiVersion: graphApiVersion })

  try {
    let recordsSynced = 0

    // Sync catalog first (campaigns, adsets, ads)
    await syncAdCatalog(apiClient, orgId, clientId).catch(() => undefined)

    // Sync insights at all three levels
    const levels: Array<"campaign" | "adset" | "ad"> = ["campaign", "adset", "ad"]

    for (const level of levels) {
      const rows = await apiClient.getInsights({ dateFrom, dateTo, level })

      for (const row of rows) {
        const objectId =
          level === "ad" ? row.ad_id :
          level === "adset" ? row.adset_id :
          row.campaign_id

        if (!objectId) continue

        const spend = parseMetaSpend(row.spend)
        const impressions = parseInt(row.impressions ?? "0", 10)
        const clicks = parseInt(row.clicks ?? "0", 10)
        const reach = row.reach ? parseInt(row.reach, 10) : null
        const conversionsCount = extractLeadActions(row.actions)

        await db
          .insert(adInsightsDaily)
          .values({
            orgId,
            clientId,
            adAccountId,
            level,
            objectId,
            date: row.date_start,
            metaCampaignId: row.campaign_id ?? null,
            metaAdsetId: row.adset_id ?? null,
            metaAdId: row.ad_id ?? null,
            impressions,
            clicks,
            spend: String(spend),
            reach,
            conversionsCount,
            currency: null, // currency is fetched at account level
          })
          .onConflictDoUpdate({
            target: [
              adInsightsDaily.orgId,
              adInsightsDaily.adAccountId,
              adInsightsDaily.date,
              adInsightsDaily.level,
              adInsightsDaily.objectId,
            ],
            set: {
              impressions,
              clicks,
              spend: String(spend),
              reach,
              conversionsCount,
              updatedAt: new Date(),
            },
          })
          .catch(() => undefined)

        recordsSynced++
      }
    }

    await db
      .update(metaSyncRuns)
      .set({ status: "completed", recordsSynced, completedAt: new Date(), lockedUntil: null, lockedBy: null })
      .where(and(eq(metaSyncRuns.id, run.id), eq(metaSyncRuns.orgId, orgId)))

    return { runId: run.id, recordsSynced }
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown_error"
    await db
      .update(metaSyncRuns)
      .set({ status: "failed", error, completedAt: new Date(), lockedUntil: null, lockedBy: null })
      .where(and(eq(metaSyncRuns.id, run.id), eq(metaSyncRuns.orgId, orgId)))
      .catch(() => undefined)

    return { runId: run.id, recordsSynced: 0, error }
  }
}

export async function getLastSyncRun(orgId: string, adAccountId: string) {
  return db.query.metaSyncRuns.findFirst({
    where: and(
      eq(metaSyncRuns.orgId, orgId),
      isNotNull(metaSyncRuns.adAccountId),
      eq(metaSyncRuns.adAccountId, adAccountId),
    ),
    orderBy: [desc(metaSyncRuns.startedAt)],
  })
}

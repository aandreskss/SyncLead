"use server"

import { db } from "@/lib/db"
import { auditLogs, adInsightsDaily, metaConnections, metaSyncRuns } from "@/lib/db/schema"
import { requireClientAccess, requireRole } from "@/lib/auth/server"
import { encryptTokenVersioned, decryptTokenVersioned } from "@/lib/crypto"
import { MetaAdsClient } from "@/lib/meta-ads/client"
import { isAdAccountAllowed, getAllowedAdAccounts, addToAllowlist, removeFromAllowlist } from "./allowlist"
import { runInsightsSync, getLastSyncRun } from "./sync-engine"
import { calculateCPL, calculateCPA, assertSingleCurrency } from "./kpi"
import { SaveInsightsConnectionSchema, AddToAllowlistSchema, TriggerSyncSchema } from "./types"
import { and, eq, gte, lte, isNotNull, sum, max } from "drizzle-orm"
import type { InsightsSummary, InsightsConnectionPublic, SyncRunPublic, AllowlistEntry } from "./types"

// ─── Feature flag check ───────────────────────────────────────────────────────
// ENABLE_EXTERNAL_META_OAUTH=false blocks the external_oauth flow
function isExternalOAuthEnabled(): boolean {
  return process.env.ENABLE_EXTERNAL_META_OAUTH === "true"
}

// ─── Connection management ────────────────────────────────────────────────────

export async function saveInsightsConnectionAction(
  input: unknown
): Promise<{ success: boolean; error?: string; connection?: InsightsConnectionPublic }> {
  const parsed = SaveInsightsConnectionSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Datos inválidos" }

  const { clientId, adAccountId, accessToken } = parsed.data

  let ctx
  try { ctx = await requireClientAccess(clientId) } catch {
    return { success: false, error: "No autorizado" }
  }

  // Block external OAuth (not yet approved by Meta)
  // Connection mode is always internal_manual during beta
  if (!isExternalOAuthEnabled() && process.env.META_CONNECTION_MODE === "external_oauth") {
    return { success: false, error: "external_oauth_disabled" }
  }

  // Allowlist check
  const allowed = await isAdAccountAllowed(adAccountId, ctx.orgId)
  if (!allowed) {
    return { success: false, error: "Esta cuenta publicitaria no está en la lista autorizada para la beta interna" }
  }

  // Verify token + account access
  const apiClient = new MetaAdsClient({
    accessToken,
    adAccountId,
    apiVersion: process.env.META_GRAPH_API_VERSION,
  })
  const verify = await apiClient.verifyAdsAccess()
  if (!verify.ok) {
    const messages: Record<string, string> = {
      invalid_token: "Token inválido o revocado",
      no_account_access: "El token no tiene acceso a esta cuenta publicitaria",
      network_error: "Error de red al verificar con Meta",
    }
    return { success: false, error: messages[verify.error ?? ""] ?? "Error de verificación" }
  }
  if (!verify.hasAdsRead) {
    return { success: false, error: "El token no tiene el permiso ads_read. Verifica los permisos del System User." }
  }

  // Encrypt token
  const { ciphertext, keyVersion } = encryptTokenVersioned(accessToken)

  // Upsert connection (one per client for now)
  const [conn] = await db
    .insert(metaConnections)
    .values({
      orgId: ctx.orgId,
      clientId,
      adAccountId,
      connectionMode: "internal_manual",
      accessTokenEnc: ciphertext,
      keyVersion,
      graphApiVersion: process.env.META_GRAPH_API_VERSION ?? "v19.0",
      status: "active",
      scopes: ["ads_read"],
      lastVerifiedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [metaConnections.clientId, metaConnections.pixelId],
      set: {
        adAccountId,
        accessTokenEnc: ciphertext,
        keyVersion,
        status: "active",
        scopes: ["ads_read"],
        lastVerifiedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      },
    })
    .returning()
    .catch(async () => {
      // No pixel, so no unique conflict — just insert
      return db
        .insert(metaConnections)
        .values({
          orgId: ctx.orgId,
          clientId,
          adAccountId,
          connectionMode: "internal_manual",
          accessTokenEnc: ciphertext,
          keyVersion,
          graphApiVersion: process.env.META_GRAPH_API_VERSION ?? "v19.0",
          status: "active",
          scopes: ["ads_read"],
          lastVerifiedAt: new Date(),
        })
        .returning()
        .then((rows) => rows)
    })

  const connection = Array.isArray(conn) ? conn[0] : conn
  if (!connection) return { success: false, error: "Error al guardar la conexión" }

  await db.insert(auditLogs).values({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "meta_insights_connection.created",
    resourceType: "meta_connection",
    resourceId: connection.id,
    metadata: { clientId, adAccountId },
  })

  return {
    success: true,
    connection: {
      id: connection.id,
      adAccountId: connection.adAccountId,
      connectionMode: connection.connectionMode,
      status: connection.status,
      lastVerifiedAt: connection.lastVerifiedAt,
      lastError: connection.lastError,
      createdAt: connection.createdAt,
    },
  }
}

export async function getInsightsConnectionsAction(
  clientId: string
): Promise<InsightsConnectionPublic[]> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return [] }

  const conns = await db.query.metaConnections.findMany({
    where: and(
      eq(metaConnections.clientId, clientId),
      eq(metaConnections.orgId, ctx.orgId),
      isNotNull(metaConnections.adAccountId),
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  })

  return conns.map((c) => ({
    id: c.id,
    adAccountId: c.adAccountId,
    connectionMode: c.connectionMode,
    status: c.status,
    lastVerifiedAt: c.lastVerifiedAt,
    lastError: c.lastError,
    createdAt: c.createdAt,
  }))
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export async function triggerSyncAction(
  input: unknown
): Promise<{ success: boolean; runId?: string; recordsSynced?: number; error?: string }> {
  const parsed = TriggerSyncSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Datos inválidos" }

  const { connectionId, clientId, syncType, dateFrom, dateTo } = parsed.data

  let ctx
  try { ctx = await requireClientAccess(clientId) } catch {
    return { success: false, error: "No autorizado" }
  }

  const conn = await db.query.metaConnections.findFirst({
    where: and(
      eq(metaConnections.id, connectionId),
      eq(metaConnections.orgId, ctx.orgId),
      eq(metaConnections.clientId, clientId),
    ),
  })

  if (!conn?.adAccountId || !conn.accessTokenEnc) {
    return { success: false, error: "Conexión no encontrada o sin credenciales" }
  }

  let accessToken: string
  try {
    accessToken = decryptTokenVersioned(conn.accessTokenEnc)
  } catch {
    return { success: false, error: "Error al descifrar el token" }
  }

  const result = await runInsightsSync({
    connectionId,
    orgId: ctx.orgId,
    clientId,
    adAccountId: conn.adAccountId,
    accessToken,
    graphApiVersion: conn.graphApiVersion,
    syncType,
    dateFrom,
    dateTo,
  })

  if (result.error) return { success: false, error: result.error, runId: result.runId }
  return { success: true, runId: result.runId, recordsSynced: result.recordsSynced }
}

export async function getLastSyncRunAction(
  clientId: string,
  adAccountId: string
): Promise<SyncRunPublic | null> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return null }

  const run = await getLastSyncRun(ctx.orgId, adAccountId)
  if (!run) return null

  return {
    id: run.id,
    status: run.status,
    syncType: run.syncType,
    adAccountId: run.adAccountId,
    dateFrom: run.dateFrom,
    dateTo: run.dateTo,
    recordsSynced: run.recordsSynced,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    error: run.error,
  }
}

// ─── KPI summary ──────────────────────────────────────────────────────────────

export async function getInsightsSummaryAction(
  clientId: string,
  adAccountId: string,
  dateFrom: string,
  dateTo: string,
  leadsCount?: number,
  conversionsRevenue?: number,
  conversionsCurrency?: string
): Promise<InsightsSummary | null> {
  let ctx
  try { ctx = await requireClientAccess(clientId) } catch { return null }

  const rows = await db
    .select({
      totalImpressions: sum(adInsightsDaily.impressions),
      totalClicks: sum(adInsightsDaily.clicks),
      totalSpend: sum(adInsightsDaily.spend),
      totalConversions: sum(adInsightsDaily.conversionsCount),
      currency: max(adInsightsDaily.currency),
    })
    .from(adInsightsDaily)
    .where(
      and(
        eq(adInsightsDaily.orgId, ctx.orgId),
        eq(adInsightsDaily.clientId, clientId),
        eq(adInsightsDaily.adAccountId, adAccountId),
        eq(adInsightsDaily.level, "campaign"),
        gte(adInsightsDaily.date, dateFrom),
        lte(adInsightsDaily.date, dateTo),
      )
    )

  const agg = rows[0]
  if (!agg) return null

  const totalSpend = parseFloat(agg.totalSpend ?? "0")
  const totalImpressions = parseInt(agg.totalImpressions ?? "0", 10)
  const totalClicks = parseInt(agg.totalClicks ?? "0", 10)
  const totalConversions = parseInt(agg.totalConversions ?? "0", 10)
  const currency = assertSingleCurrency([agg.currency])

  const totalLeads = leadsCount ?? 0
  const roas =
    conversionsRevenue !== undefined && conversionsCurrency === currency
      ? (totalSpend > 0 ? conversionsRevenue / totalSpend : null)
      : null

  const lastRun = await getLastSyncRun(ctx.orgId, adAccountId)

  return {
    dateFrom,
    dateTo,
    adAccountId,
    currency,
    totalImpressions,
    totalClicks,
    totalSpend,
    totalLeads,
    totalConversions,
    cpl: calculateCPL(totalSpend, totalLeads),
    cpa: calculateCPA(totalSpend, totalConversions),
    roas,
    lastSyncedAt: lastRun?.completedAt ?? null,
  }
}

// ─── Allowlist management ─────────────────────────────────────────────────────

export async function addToAllowlistAction(
  input: unknown
): Promise<{ success: boolean; error?: string }> {
  const parsed = AddToAllowlistSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "ID de cuenta inválido" }

  let ctx
  try { ctx = await requireRole(["owner", "admin"]) } catch {
    return { success: false, error: "Solo owner/admin pueden gestionar la lista autorizada" }
  }

  await addToAllowlist(ctx.orgId, parsed.data.adAccountId, ctx.userId, parsed.data.notes)
  return { success: true }
}

export async function removeFromAllowlistAction(
  adAccountId: string
): Promise<{ success: boolean; error?: string }> {
  let ctx
  try { ctx = await requireRole(["owner", "admin"]) } catch {
    return { success: false, error: "No autorizado" }
  }

  await removeFromAllowlist(ctx.orgId, adAccountId)
  return { success: true }
}

export async function getAllowlistAction(): Promise<AllowlistEntry[]> {
  let ctx
  try { ctx = await requireRole(["owner", "admin", "manager"]) } catch { return [] }
  return getAllowedAdAccounts(ctx.orgId)
}

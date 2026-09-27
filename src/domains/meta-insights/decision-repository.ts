import "server-only"
import { db } from "@/lib/db"
import {
  adInsightsDaily,
  metaCatalogCampaigns,
  metaCatalogAds,
  metaConnections,
  metaSyncRuns,
  leads,
  conversions,
  campaigns,
} from "@/lib/db/schema"
import { and, eq, gte, lte, sum, max, count, desc, sql, or } from "drizzle-orm"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CampaignMetricsRow {
  metaCampaignId: string
  name: string | null
  spend: number
  impressions: number
  clicks: number
  conversionsCount: number
  currency: string | null
  ctr: number
  cpm: number
  cpc: number
  prevSpend: number
  prevImpressions: number
  prevClicks: number
  prevConversionsCount: number
  spendDelta: number
  ctrDelta: number
  lastActivityDate: string | null
  daysSinceActivity: number
}

export interface AccountMetricsData {
  totalSpend: number
  totalImpressions: number
  totalClicks: number
  totalConversions: number
  currency: string | null
  ctr: number
  activeCampaigns: number
  currentMonthSpend: number
  projectedMonthSpend: number
  daysElapsed: number
  daysInMonth: number
}

export interface AdMetricsRow {
  metaAdId: string
  name: string | null
  metaCampaignId: string | null
  campaignName: string | null
  spend: number
  impressions: number
  clicks: number
  ctr: number
  currency: string | null
}

export interface LeadCampaignRow {
  campaignId: string
  campaignName: string
  totalLeads: number
  hotLeads: number
  warmLeads: number
  coldLeads: number
  qualifiedLeads: number
  totalSales: number
  totalRevenue: number
  revenueCurrency: string | null
  conversionRate: number
}

// ─── Helper: date strings ─────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function subtractDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() - days)
  return r
}

// ─── getActiveInsightsConnection ─────────────────────────────────────────────

export async function getActiveInsightsConnection(
  orgId: string,
  clientId: string
): Promise<{ id: string; adAccountId: string; status: string } | null> {
  const rows = await db
    .select({
      id: metaConnections.id,
      adAccountId: metaConnections.adAccountId,
      status: metaConnections.status,
    })
    .from(metaConnections)
    .where(
      and(
        eq(metaConnections.orgId, orgId),
        eq(metaConnections.clientId, clientId),
        eq(metaConnections.status, "active")
      )
    )
    .limit(1)

  const row = rows[0]
  if (!row || !row.adAccountId) return null
  return { id: row.id, adAccountId: row.adAccountId, status: row.status }
}

// ─── getCampaignMetrics ───────────────────────────────────────────────────────

export async function getCampaignMetrics(
  orgId: string,
  clientId: string,
  adAccountId: string,
  days: number
): Promise<CampaignMetricsRow[]> {
  const today = new Date()
  const currentFrom = toDateStr(subtractDays(today, days))
  const currentTo = toDateStr(today)
  const prevFrom = toDateStr(subtractDays(today, days * 2))
  const prevTo = toDateStr(subtractDays(today, days + 1))

  // Current period
  const currentRows = await db
    .select({
      objectId: adInsightsDaily.objectId,
      spend: sum(adInsightsDaily.spend).as("spend"),
      impressions: sum(adInsightsDaily.impressions).as("impressions"),
      clicks: sum(adInsightsDaily.clicks).as("clicks"),
      conversionsCount: sum(adInsightsDaily.conversionsCount).as("conversions_count"),
      currency: max(adInsightsDaily.currency).as("currency"),
      lastActivityDate: max(adInsightsDaily.date).as("last_activity_date"),
    })
    .from(adInsightsDaily)
    .where(
      and(
        eq(adInsightsDaily.orgId, orgId),
        eq(adInsightsDaily.clientId, clientId),
        eq(adInsightsDaily.adAccountId, adAccountId),
        eq(adInsightsDaily.level, "campaign"),
        gte(adInsightsDaily.date, currentFrom),
        lte(adInsightsDaily.date, currentTo)
      )
    )
    .groupBy(adInsightsDaily.objectId)

  // Previous period
  const prevRows = await db
    .select({
      objectId: adInsightsDaily.objectId,
      spend: sum(adInsightsDaily.spend).as("spend"),
      impressions: sum(adInsightsDaily.impressions).as("impressions"),
      clicks: sum(adInsightsDaily.clicks).as("clicks"),
      conversionsCount: sum(adInsightsDaily.conversionsCount).as("conversions_count"),
    })
    .from(adInsightsDaily)
    .where(
      and(
        eq(adInsightsDaily.orgId, orgId),
        eq(adInsightsDaily.clientId, clientId),
        eq(adInsightsDaily.adAccountId, adAccountId),
        eq(adInsightsDaily.level, "campaign"),
        gte(adInsightsDaily.date, prevFrom),
        lte(adInsightsDaily.date, prevTo)
      )
    )
    .groupBy(adInsightsDaily.objectId)

  // Fetch campaign names
  const objectIds = currentRows.map((r) => r.objectId).filter((id): id is string => id !== null)
  const nameMap = new Map<string, string>()

  if (objectIds.length > 0) {
    const nameRows = await db
      .select({
        metaCampaignId: metaCatalogCampaigns.metaCampaignId,
        name: metaCatalogCampaigns.name,
      })
      .from(metaCatalogCampaigns)
      .where(
        and(
          eq(metaCatalogCampaigns.orgId, orgId),
          eq(metaCatalogCampaigns.clientId, clientId)
        )
      )
    for (const nr of nameRows) {
      nameMap.set(nr.metaCampaignId, nr.name)
    }
  }

  // Build prev map
  const prevMap = new Map<
    string,
    { spend: number; impressions: number; clicks: number; conversionsCount: number }
  >()
  for (const pr of prevRows) {
    if (!pr.objectId) continue
    prevMap.set(pr.objectId, {
      spend: Number(pr.spend ?? 0),
      impressions: Number(pr.impressions ?? 0),
      clicks: Number(pr.clicks ?? 0),
      conversionsCount: Number(pr.conversionsCount ?? 0),
    })
  }

  const todayDate = new Date()
  const result: CampaignMetricsRow[] = []

  for (const cr of currentRows) {
    if (!cr.objectId) continue

    const spend = Number(cr.spend ?? 0)
    const impressions = Number(cr.impressions ?? 0)
    const clicks = Number(cr.clicks ?? 0)
    const conversionsCount = Number(cr.conversionsCount ?? 0)
    const currency = cr.currency ?? null
    const lastActivityDate = cr.lastActivityDate ?? null

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0
    const cpc = clicks > 0 ? spend / clicks : 0

    const prev = prevMap.get(cr.objectId) ?? {
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversionsCount: 0,
    }

    const prevCtr = prev.impressions > 0 ? (prev.clicks / prev.impressions) * 100 : 0
    const spendDelta =
      prev.spend > 0 ? ((spend - prev.spend) / prev.spend) * 100 : 0
    const ctrDelta = ctr - prevCtr

    // Days since last activity
    let daysSinceActivity = 0
    if (lastActivityDate) {
      const lastDate = new Date(lastActivityDate)
      daysSinceActivity = Math.floor(
        (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    }

    result.push({
      metaCampaignId: cr.objectId,
      name: nameMap.get(cr.objectId) ?? null,
      spend,
      impressions,
      clicks,
      conversionsCount,
      currency,
      ctr,
      cpm,
      cpc,
      prevSpend: prev.spend,
      prevImpressions: prev.impressions,
      prevClicks: prev.clicks,
      prevConversionsCount: prev.conversionsCount,
      spendDelta,
      ctrDelta,
      lastActivityDate,
      daysSinceActivity,
    })
  }

  return result
}

// ─── getAccountMetrics ────────────────────────────────────────────────────────

export async function getAccountMetrics(
  orgId: string,
  clientId: string,
  adAccountId: string,
  days: number
): Promise<AccountMetricsData> {
  const today = new Date()
  const dateFrom = toDateStr(subtractDays(today, days))
  const dateTo = toDateStr(today)

  // Current period aggregates
  const aggRows = await db
    .select({
      totalSpend: sum(adInsightsDaily.spend).as("total_spend"),
      totalImpressions: sum(adInsightsDaily.impressions).as("total_impressions"),
      totalClicks: sum(adInsightsDaily.clicks).as("total_clicks"),
      totalConversions: sum(adInsightsDaily.conversionsCount).as("total_conversions"),
      currency: max(adInsightsDaily.currency).as("currency"),
      activeCampaigns: count(adInsightsDaily.objectId).as("active_campaigns"),
    })
    .from(adInsightsDaily)
    .where(
      and(
        eq(adInsightsDaily.orgId, orgId),
        eq(adInsightsDaily.clientId, clientId),
        eq(adInsightsDaily.adAccountId, adAccountId),
        eq(adInsightsDaily.level, "campaign"),
        gte(adInsightsDaily.date, dateFrom),
        lte(adInsightsDaily.date, dateTo)
      )
    )

  const agg = aggRows[0]
  const totalSpend = Number(agg?.totalSpend ?? 0)
  const totalImpressions = Number(agg?.totalImpressions ?? 0)
  const totalClicks = Number(agg?.totalClicks ?? 0)
  const totalConversions = Number(agg?.totalConversions ?? 0)
  const currency = agg?.currency ?? null
  const activeCampaigns = Number(agg?.activeCampaigns ?? 0)
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0

  // Current calendar month spend
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthStartStr = toDateStr(monthStart)

  const monthAggRows = await db
    .select({
      monthSpend: sum(adInsightsDaily.spend).as("month_spend"),
    })
    .from(adInsightsDaily)
    .where(
      and(
        eq(adInsightsDaily.orgId, orgId),
        eq(adInsightsDaily.clientId, clientId),
        eq(adInsightsDaily.adAccountId, adAccountId),
        eq(adInsightsDaily.level, "campaign"),
        gte(adInsightsDaily.date, monthStartStr),
        lte(adInsightsDaily.date, dateTo)
      )
    )

  const currentMonthSpend = Number(monthAggRows[0]?.monthSpend ?? 0)
  const daysElapsed = today.getDate()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const projectedMonthSpend =
    daysElapsed > 0 ? (currentMonthSpend / daysElapsed) * daysInMonth : 0

  return {
    totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    currency,
    ctr,
    activeCampaigns,
    currentMonthSpend,
    projectedMonthSpend,
    daysElapsed,
    daysInMonth,
  }
}

// ─── getAdMetrics ─────────────────────────────────────────────────────────────

export async function getAdMetrics(
  orgId: string,
  clientId: string,
  adAccountId: string,
  days: number
): Promise<AdMetricsRow[]> {
  const today = new Date()
  const dateFrom = toDateStr(subtractDays(today, days))
  const dateTo = toDateStr(today)

  const adRows = await db
    .select({
      objectId: adInsightsDaily.objectId,
      spend: sum(adInsightsDaily.spend).as("spend"),
      impressions: sum(adInsightsDaily.impressions).as("impressions"),
      clicks: sum(adInsightsDaily.clicks).as("clicks"),
      currency: max(adInsightsDaily.currency).as("currency"),
    })
    .from(adInsightsDaily)
    .where(
      and(
        eq(adInsightsDaily.orgId, orgId),
        eq(adInsightsDaily.clientId, clientId),
        eq(adInsightsDaily.adAccountId, adAccountId),
        eq(adInsightsDaily.level, "ad"),
        gte(adInsightsDaily.date, dateFrom),
        lte(adInsightsDaily.date, dateTo)
      )
    )
    .groupBy(adInsightsDaily.objectId)
    .orderBy(desc(sum(adInsightsDaily.spend)))
    .limit(20)

  const adIds = adRows.map((r) => r.objectId).filter((id): id is string => id !== null)
  const adNameMap = new Map<string, { name: string; metaCampaignId: string }>()
  const campaignNameMap = new Map<string, string>()

  if (adIds.length > 0) {
    const adCatalogRows = await db
      .select({
        metaAdId: metaCatalogAds.metaAdId,
        name: metaCatalogAds.name,
        metaCampaignId: metaCatalogAds.metaCampaignId,
      })
      .from(metaCatalogAds)
      .where(
        and(
          eq(metaCatalogAds.orgId, orgId),
          eq(metaCatalogAds.clientId, clientId)
        )
      )

    for (const r of adCatalogRows) {
      adNameMap.set(r.metaAdId, { name: r.name, metaCampaignId: r.metaCampaignId })
    }

    const campaignIds = [...new Set(adCatalogRows.map((r) => r.metaCampaignId))]
    if (campaignIds.length > 0) {
      const campRows = await db
        .select({
          metaCampaignId: metaCatalogCampaigns.metaCampaignId,
          name: metaCatalogCampaigns.name,
        })
        .from(metaCatalogCampaigns)
        .where(
          and(
            eq(metaCatalogCampaigns.orgId, orgId),
            eq(metaCatalogCampaigns.clientId, clientId)
          )
        )
      for (const r of campRows) {
        campaignNameMap.set(r.metaCampaignId, r.name)
      }
    }
  }

  return adRows
    .filter((r) => r.objectId !== null)
    .map((r) => {
      const spend = Number(r.spend ?? 0)
      const impressions = Number(r.impressions ?? 0)
      const clicks = Number(r.clicks ?? 0)
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
      const adInfo = r.objectId ? adNameMap.get(r.objectId) : undefined
      const metaCampaignId = adInfo?.metaCampaignId ?? null
      const campaignName = metaCampaignId ? (campaignNameMap.get(metaCampaignId) ?? null) : null

      return {
        metaAdId: r.objectId!,
        name: adInfo?.name ?? null,
        metaCampaignId,
        campaignName,
        spend,
        impressions,
        clicks,
        ctr,
        currency: r.currency ?? null,
      }
    })
}

// ─── getLeadCampaignData ──────────────────────────────────────────────────────

export async function getLeadCampaignData(
  orgId: string,
  clientId: string,
  _days: number
): Promise<LeadCampaignRow[]> {
  // Always use last 90 days for leads/conversions cross-data
  const today = new Date()
  const dateFrom = toDateStr(subtractDays(today, 90))

  // Get all campaigns for this client
  const clientCampaigns = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), eq(campaigns.clientId, clientId)))

  if (clientCampaigns.length === 0) return []

  const campaignIds = clientCampaigns.map((c) => c.id)
  const campaignNameMap = new Map(clientCampaigns.map((c) => [c.id, c.name]))

  // Lead counts per campaign using conditional aggregation
  const leadRows = await db
    .select({
      campaignId: leads.campaignId,
      totalLeads: count(leads.id).as("total_leads"),
      hotLeads: sql<number>`SUM(CASE WHEN ${leads.temperature} = 'hot' THEN 1 ELSE 0 END)`.as("hot_leads"),
      warmLeads: sql<number>`SUM(CASE WHEN ${leads.temperature} = 'warm' THEN 1 ELSE 0 END)`.as("warm_leads"),
      coldLeads: sql<number>`SUM(CASE WHEN ${leads.temperature} = 'cold' THEN 1 ELSE 0 END)`.as("cold_leads"),
      qualifiedLeads: sql<number>`SUM(CASE WHEN ${leads.effectiveQualClass} IN ('hot', 'warm') THEN 1 ELSE 0 END)`.as("qualified_leads"),
    })
    .from(leads)
    .where(
      and(
        eq(leads.orgId, orgId),
        sql`${leads.campaignId} = ANY(${sql.raw(`ARRAY[${campaignIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})`,
        gte(leads.createdAt, new Date(dateFrom))
      )
    )
    .groupBy(leads.campaignId)

  // Confirmed sales per campaign
  const salesRows = await db
    .select({
      campaignId: conversions.campaignId,
      totalSales: count(conversions.id).as("total_sales"),
      totalRevenue: sum(conversions.amount).as("total_revenue"),
      currency: max(conversions.currency).as("currency"),
    })
    .from(conversions)
    .where(
      and(
        eq(conversions.orgId, orgId),
        eq(conversions.status, "confirmed"),
        sql`${conversions.campaignId} = ANY(${sql.raw(`ARRAY[${campaignIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})`
      )
    )
    .groupBy(conversions.campaignId)

  const salesMap = new Map<
    string,
    { totalSales: number; totalRevenue: number; currency: string | null }
  >()
  for (const sr of salesRows) {
    if (!sr.campaignId) continue
    salesMap.set(sr.campaignId, {
      totalSales: Number(sr.totalSales ?? 0),
      totalRevenue: Number(sr.totalRevenue ?? 0),
      currency: sr.currency ?? null,
    })
  }

  const result: LeadCampaignRow[] = []

  for (const lr of leadRows) {
    if (!lr.campaignId) continue
    const totalLeads = Number(lr.totalLeads ?? 0)
    const hotLeads = Number(lr.hotLeads ?? 0)
    const warmLeads = Number(lr.warmLeads ?? 0)
    const coldLeads = Number(lr.coldLeads ?? 0)
    const qualifiedLeads = Number(lr.qualifiedLeads ?? 0)
    const sales = salesMap.get(lr.campaignId)
    const totalSales = sales?.totalSales ?? 0
    const totalRevenue = sales?.totalRevenue ?? 0
    const revenueCurrency = sales?.currency ?? null
    const conversionRate = totalLeads > 0 ? (totalSales / totalLeads) * 100 : 0

    result.push({
      campaignId: lr.campaignId,
      campaignName: campaignNameMap.get(lr.campaignId) ?? lr.campaignId,
      totalLeads,
      hotLeads,
      warmLeads,
      coldLeads,
      qualifiedLeads,
      totalSales,
      totalRevenue,
      revenueCurrency,
      conversionRate,
    })
  }

  // Include campaigns with 0 leads if they have sales
  for (const [campaignId, sales] of salesMap) {
    if (result.some((r) => r.campaignId === campaignId)) continue
    result.push({
      campaignId,
      campaignName: campaignNameMap.get(campaignId) ?? campaignId,
      totalLeads: 0,
      hotLeads: 0,
      warmLeads: 0,
      coldLeads: 0,
      qualifiedLeads: 0,
      totalSales: sales.totalSales,
      totalRevenue: sales.totalRevenue,
      revenueCurrency: sales.currency,
      conversionRate: 0,
    })
  }

  return result.filter((r) => r.totalLeads > 0 || r.totalSales > 0)
}

// ─── getLastSyncInfo ──────────────────────────────────────────────────────────

export async function getLastSyncInfo(
  orgId: string,
  adAccountId: string
): Promise<{ lastSync: Date | null; recordsSynced: number; status: string } | null> {
  const rows = await db
    .select({
      completedAt: metaSyncRuns.completedAt,
      recordsSynced: metaSyncRuns.recordsSynced,
      status: metaSyncRuns.status,
    })
    .from(metaSyncRuns)
    .where(
      and(
        eq(metaSyncRuns.orgId, orgId),
        eq(metaSyncRuns.adAccountId, adAccountId),
        or(
          eq(metaSyncRuns.status, "completed"),
          eq(metaSyncRuns.status, "failed")
        )
      )
    )
    .orderBy(desc(metaSyncRuns.startedAt))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  return {
    lastSync: row.completedAt ?? null,
    recordsSynced: row.recordsSynced ?? 0,
    status: row.status,
  }
}

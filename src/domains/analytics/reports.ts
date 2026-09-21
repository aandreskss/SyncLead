import "server-only"

import { db } from "@/lib/db"
import { leads, campaigns, conversions, adInsightsDaily, clients } from "@/lib/db/schema"
import { and, eq, gte, lte, sql, inArray } from "drizzle-orm"

export interface CampaignReportRow {
  campaignId: string
  campaignName: string
  totalLeads: number
  hotLeads: number
  warmLeads: number
  coldLeads: number
  totalSales: number
  totalRevenue: number | null
  currency: string | null
  totalSpend: number | null
  roas: number | null
}

export interface ReportData {
  clientId: string
  clientName: string
  orgId: string
  from: Date
  to: Date
  totalLeads: number
  hotLeads: number
  warmLeads: number
  coldLeads: number
  totalSales: number
  totalRevenue: number | null
  primaryCurrency: string | null
  totalSpend: number | null
  roas: number | null
  campaigns: CampaignReportRow[]
  leadsPerDay: { day: string; total: number }[]
}

export async function getReportData(
  orgId: string,
  clientId: string,
  from: Date,
  to: Date,
): Promise<ReportData | null> {
  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, clientId), eq(clients.orgId, orgId)),
    columns: { id: true, name: true },
  })
  if (!client) return null

  const clientCampaigns = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(and(eq(campaigns.orgId, orgId), eq(campaigns.clientId, clientId)))

  const campaignIds = clientCampaigns.map((c) => c.id)
  const campaignNameMap = new Map(clientCampaigns.map((c) => [c.id, c.name]))

  if (campaignIds.length === 0) {
    return {
      clientId,
      clientName: client.name,
      orgId,
      from,
      to,
      totalLeads: 0,
      hotLeads: 0,
      warmLeads: 0,
      coldLeads: 0,
      totalSales: 0,
      totalRevenue: null,
      primaryCurrency: null,
      totalSpend: null,
      roas: null,
      campaigns: [],
      leadsPerDay: [],
    }
  }

  const [leadRows, convRows, spendRows, dailyRows] = await Promise.all([
    // Leads by campaign + temperature
    db
      .select({
        campaignId: leads.campaignId,
        temperature: leads.temperature,
        cnt: sql<number>`cast(count(*) as int)`,
      })
      .from(leads)
      .where(
        and(
          eq(leads.orgId, orgId),
          gte(leads.createdAt, from),
          lte(leads.createdAt, to),
          inArray(leads.campaignId, campaignIds),
        ),
      )
      .groupBy(leads.campaignId, leads.temperature),

    // Confirmed conversions by campaign
    db
      .select({
        campaignId: leads.campaignId,
        currency: conversions.currency,
        cnt: sql<number>`cast(count(*) as int)`,
        revenue: sql<string>`coalesce(sum(${conversions.amount}::numeric), 0)::text`,
      })
      .from(conversions)
      .innerJoin(leads, eq(conversions.leadId, leads.id))
      .where(
        and(
          eq(conversions.orgId, orgId),
          gte(conversions.convertedAt, from),
          lte(conversions.convertedAt, to),
          eq(conversions.status, "confirmed"),
          inArray(leads.campaignId, campaignIds),
        ),
      )
      .groupBy(leads.campaignId, conversions.currency),

    // Ad spend by campaign from insights
    db
      .select({
        campaignId: adInsightsDaily.campaignId,
        currency: adInsightsDaily.currency,
        spend: sql<string>`coalesce(sum(${adInsightsDaily.spend}::numeric), 0)::text`,
      })
      .from(adInsightsDaily)
      .where(
        and(
          eq(adInsightsDaily.orgId, orgId),
          eq(adInsightsDaily.clientId, clientId),
          gte(adInsightsDaily.date, sql`${from.toISOString().split("T")[0]}::date`),
          lte(adInsightsDaily.date, sql`${to.toISOString().split("T")[0]}::date`),
          inArray(adInsightsDaily.campaignId, campaignIds),
        ),
      )
      .groupBy(adInsightsDaily.campaignId, adInsightsDaily.currency),

    // Leads per day (for sparkline)
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${leads.createdAt}), 'YYYY-MM-DD')`,
        total: sql<number>`cast(count(*) as int)`,
      })
      .from(leads)
      .where(
        and(
          eq(leads.orgId, orgId),
          gte(leads.createdAt, from),
          lte(leads.createdAt, to),
          inArray(leads.campaignId, campaignIds),
        ),
      )
      .groupBy(sql`date_trunc('day', ${leads.createdAt})`)
      .orderBy(sql`date_trunc('day', ${leads.createdAt})`),
  ])

  // Build campaign map
  type CampaignAgg = {
    totalLeads: number; hot: number; warm: number; cold: number
    totalSales: number; revenue: number | null; currency: string | null
    spend: number | null; spendCurrency: string | null
  }
  const aggMap = new Map<string, CampaignAgg>()

  for (const cId of campaignIds) {
    aggMap.set(cId, { totalLeads: 0, hot: 0, warm: 0, cold: 0, totalSales: 0, revenue: null, currency: null, spend: null, spendCurrency: null })
  }

  for (const r of leadRows) {
    const agg = aggMap.get(r.campaignId!)
    if (!agg) continue
    const n = Number(r.cnt)
    agg.totalLeads += n
    if (r.temperature === "hot") agg.hot += n
    else if (r.temperature === "warm") agg.warm += n
    else agg.cold += n
  }

  for (const r of convRows) {
    const agg = aggMap.get(r.campaignId!)
    if (!agg) continue
    agg.totalSales += Number(r.cnt)
    const rev = parseFloat(r.revenue ?? "0")
    if (agg.revenue === null) { agg.revenue = rev; agg.currency = r.currency }
    else if (agg.currency === r.currency) agg.revenue += rev
    else { agg.revenue = null; agg.currency = null } // mixed currency
  }

  for (const r of spendRows) {
    const agg = aggMap.get(r.campaignId!)
    if (!agg || !r.campaignId) continue
    const sp = parseFloat(r.spend ?? "0")
    if (agg.spend === null) { agg.spend = sp; agg.spendCurrency = r.currency }
    else if (agg.spendCurrency === r.currency) agg.spend += sp
  }

  const campaignResult: CampaignReportRow[] = []
  for (const [cId, agg] of aggMap) {
    const roas =
      agg.revenue !== null && agg.spend !== null && agg.spend > 0
        ? agg.revenue / agg.spend
        : null
    campaignResult.push({
      campaignId: cId,
      campaignName: campaignNameMap.get(cId) ?? cId,
      totalLeads: agg.totalLeads,
      hotLeads: agg.hot,
      warmLeads: agg.warm,
      coldLeads: agg.cold,
      totalSales: agg.totalSales,
      totalRevenue: agg.revenue,
      currency: agg.currency,
      totalSpend: agg.spend,
      roas,
    })
  }
  campaignResult.sort((a, b) => b.totalLeads - a.totalLeads)

  // Org-level totals
  const totalLeads = campaignResult.reduce((s, c) => s + c.totalLeads, 0)
  const hotLeads = campaignResult.reduce((s, c) => s + c.hotLeads, 0)
  const warmLeads = campaignResult.reduce((s, c) => s + c.warmLeads, 0)
  const coldLeads = campaignResult.reduce((s, c) => s + c.coldLeads, 0)
  const totalSales = campaignResult.reduce((s, c) => s + c.totalSales, 0)

  // Revenue: sum if all same currency, null if mixed
  let totalRevenue: number | null = null
  let primaryCurrency: string | null = null
  for (const c of campaignResult) {
    if (c.totalRevenue === null || c.currency === null) continue
    if (primaryCurrency === null) { primaryCurrency = c.currency; totalRevenue = c.totalRevenue }
    else if (primaryCurrency === c.currency) totalRevenue = (totalRevenue ?? 0) + c.totalRevenue
    else { totalRevenue = null; break }
  }

  let totalSpend: number | null = null
  for (const c of campaignResult) {
    if (c.totalSpend !== null) totalSpend = (totalSpend ?? 0) + c.totalSpend
  }

  const roas =
    totalRevenue !== null && totalSpend !== null && totalSpend > 0
      ? totalRevenue / totalSpend
      : null

  return {
    clientId,
    clientName: client.name,
    orgId,
    from,
    to,
    totalLeads,
    hotLeads,
    warmLeads,
    coldLeads,
    totalSales,
    totalRevenue,
    primaryCurrency,
    totalSpend,
    roas,
    campaigns: campaignResult,
    leadsPerDay: dailyRows.map((r) => ({ day: r.day, total: Number(r.total) })),
  }
}

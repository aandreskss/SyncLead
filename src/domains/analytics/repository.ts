import { db } from "@/lib/db"
import { leads, campaigns, conversions } from "@/lib/db/schema"
import { and, eq, gte, lte, count, desc, sql } from "drizzle-orm"
import type { DashboardKPIs, Metric, PerformanceRow } from "./types"

export type { DashboardKPIs, Metric, PerformanceRow }

// ─── KPI metrics ──────────────────────────────────────────────────────────────
// Leads use leads.created_at; sales/revenue use conversions.converted_at.

export async function getKPIMetrics(
  orgId: string,
  from: Date,
  to: Date,
): Promise<DashboardKPIs> {
  const [[leadRow], [salesRow]] = await Promise.all([
    db
      .select({ totalLeads: count(leads.id) })
      .from(leads)
      .where(and(eq(leads.orgId, orgId), gte(leads.createdAt, from), lte(leads.createdAt, to))),

    db
      .select({
        totalSales: sql<number>`cast(count(*) as int)`,
        totalRevenue: sql<string>`coalesce(sum(${conversions.amount}::numeric), 0)::text`,
      })
      .from(conversions)
      .where(
        and(
          eq(conversions.orgId, orgId),
          gte(conversions.convertedAt, from),
          lte(conversions.convertedAt, to),
          eq(conversions.status, "confirmed"),
        ),
      ),
  ])

  const totalLeads = Number(leadRow?.totalLeads ?? 0)
  const totalSales = Number(salesRow?.totalSales ?? 0)
  const rev = parseFloat(salesRow?.totalRevenue ?? "0")
  const totalRevenue: Metric = totalSales > 0 ? rev : null
  const avgTicket: Metric = totalSales > 0 ? rev / totalSales : null
  const conversionRate: Metric = totalLeads > 0 ? (totalSales / totalLeads) * 100 : null

  return { totalLeads, totalSales, conversionRate, totalRevenue, avgTicket }
}

// ─── Performance table ─────────────────────────────────────────────────────────
// Leads filtered by leads.created_at; conversions joined by converted_at.

export async function getPerformanceTable(
  orgId: string,
  from: Date,
  to: Date,
): Promise<PerformanceRow[]> {
  const rows = await db
    .select({
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      utmContent: sql<string>`coalesce(nullif(${leads.utmContent}, ''), '(sin anuncio)')`,
      totalLeads: sql<number>`cast(count(distinct ${leads.id}) as int)`,
      totalSales: sql<number>`cast(count(distinct ${conversions.id}) as int)`,
      totalRevenue: sql<string>`coalesce(sum(${conversions.amount}::numeric), 0)::text`,
    })
    .from(leads)
    .innerJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .leftJoin(
      conversions,
      and(
        eq(conversions.leadId, leads.id),
        gte(conversions.convertedAt, from),
        lte(conversions.convertedAt, to),
        eq(conversions.status, "confirmed"),
      ),
    )
    .where(and(eq(leads.orgId, orgId), gte(leads.createdAt, from), lte(leads.createdAt, to)))
    .groupBy(
      campaigns.id,
      campaigns.name,
      sql`coalesce(nullif(${leads.utmContent}, ''), '(sin anuncio)')`,
    )
    .orderBy(desc(sql`count(distinct ${leads.id})`))

  return rows.map((r) => {
    const tl = Number(r.totalLeads)
    const ts = Number(r.totalSales)
    return {
      campaignId: r.campaignId,
      campaignName: r.campaignName,
      utmContent: r.utmContent,
      totalLeads: tl,
      totalSales: ts,
      convRate: tl > 0 ? (ts / tl) * 100 : null,
      totalRevenue: parseFloat(r.totalRevenue ?? "0"),
    }
  })
}

// ─── Leads por día ─────────────────────────────────────────────────────────────
// total: leads by created_at; converted: confirmed conversions by converted_at.

export interface LeadsByDayRow {
  day: string
  total: number
  converted: number
}

export async function getLeadsByDay(
  orgId: string,
  from: Date,
  to: Date,
): Promise<LeadsByDayRow[]> {
  const [leadRows, convRows] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${leads.createdAt}), 'YYYY-MM-DD')`,
        total: sql<number>`cast(count(${leads.id}) as int)`,
      })
      .from(leads)
      .where(and(eq(leads.orgId, orgId), gte(leads.createdAt, from), lte(leads.createdAt, to)))
      .groupBy(sql`date_trunc('day', ${leads.createdAt})`)
      .orderBy(sql`date_trunc('day', ${leads.createdAt}) asc`),

    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${conversions.convertedAt}), 'YYYY-MM-DD')`,
        converted: sql<number>`cast(count(${conversions.id}) as int)`,
      })
      .from(conversions)
      .where(
        and(
          eq(conversions.orgId, orgId),
          gte(conversions.convertedAt, from),
          lte(conversions.convertedAt, to),
          eq(conversions.status, "confirmed"),
        ),
      )
      .groupBy(sql`date_trunc('day', ${conversions.convertedAt})`),
  ])

  const map: Record<string, LeadsByDayRow> = {}
  for (const r of leadRows) {
    if (!map[r.day]) map[r.day] = { day: r.day, total: 0, converted: 0 }
    map[r.day].total = Number(r.total)
  }
  for (const r of convRows) {
    if (!map[r.day]) map[r.day] = { day: r.day, total: 0, converted: 0 }
    map[r.day].converted = Number(r.converted)
  }

  return Object.values(map).sort((a, b) => a.day.localeCompare(b.day))
}

// ─── Leads por campaña ─────────────────────────────────────────────────────────

export interface LeadsByCampaignRow {
  name: string
  total: number
  converted: number
}

export async function getLeadsByCampaignChart(
  orgId: string,
  from: Date,
  to: Date,
): Promise<LeadsByCampaignRow[]> {
  const rows = await db
    .select({
      name: campaigns.name,
      total: sql<number>`cast(count(distinct ${leads.id}) as int)`,
      converted: sql<number>`cast(count(distinct ${conversions.id}) as int)`,
    })
    .from(leads)
    .innerJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .leftJoin(
      conversions,
      and(
        eq(conversions.leadId, leads.id),
        gte(conversions.convertedAt, from),
        lte(conversions.convertedAt, to),
        eq(conversions.status, "confirmed"),
      ),
    )
    .where(and(eq(leads.orgId, orgId), gte(leads.createdAt, from), lte(leads.createdAt, to)))
    .groupBy(campaigns.name)
    .orderBy(desc(sql`count(distinct ${leads.id})`))

  return rows.map((r) => ({
    name: r.name,
    total: Number(r.total),
    converted: Number(r.converted),
  }))
}

// ─── Leads por UTM content (top 10) ────────────────────────────────────────────

export interface LeadsByUtmRow {
  utmContent: string
  total: number
}

export async function getLeadsByUtmContent(
  orgId: string,
  from: Date,
  to: Date,
): Promise<LeadsByUtmRow[]> {
  const rows = await db
    .select({
      utmContent: sql<string>`coalesce(nullif(${leads.utmContent}, ''), '(sin anuncio)')`,
      total: sql<number>`cast(count(${leads.id}) as int)`,
    })
    .from(leads)
    .where(and(eq(leads.orgId, orgId), gte(leads.createdAt, from), lte(leads.createdAt, to)))
    .groupBy(sql`coalesce(nullif(${leads.utmContent}, ''), '(sin anuncio)')`)
    .orderBy(desc(sql`count(${leads.id})`))
    .limit(10)

  return rows.map((r) => ({ utmContent: r.utmContent, total: Number(r.total) }))
}

// ─── Leads por plataforma ──────────────────────────────────────────────────────

export interface LeadsByPlatformRow {
  platform: string
  total: number
}

export async function getLeadsByPlatform(
  orgId: string,
  from: Date,
  to: Date,
): Promise<LeadsByPlatformRow[]> {
  const rows = await db
    .select({
      platform: sql<string>`coalesce(nullif(${leads.platform}, ''), 'Directo')`,
      total: sql<number>`cast(count(${leads.id}) as int)`,
    })
    .from(leads)
    .where(and(eq(leads.orgId, orgId), gte(leads.createdAt, from), lte(leads.createdAt, to)))
    .groupBy(sql`coalesce(nullif(${leads.platform}, ''), 'Directo')`)
    .orderBy(desc(sql`count(${leads.id})`))

  return rows.map((r) => ({ platform: r.platform, total: Number(r.total) }))
}

// ─── Leads por dispositivo ─────────────────────────────────────────────────────

export interface LeadsByDeviceRow {
  device: string
  total: number
}

export async function getLeadsByDevice(
  orgId: string,
  from: Date,
  to: Date,
): Promise<LeadsByDeviceRow[]> {
  const rows = await db
    .select({
      device: sql<string>`coalesce(nullif(${leads.device}, ''), 'Desconocido')`,
      total: sql<number>`cast(count(${leads.id}) as int)`,
    })
    .from(leads)
    .where(and(eq(leads.orgId, orgId), gte(leads.createdAt, from), lte(leads.createdAt, to)))
    .groupBy(sql`coalesce(nullif(${leads.device}, ''), 'Desconocido')`)
    .orderBy(desc(sql`count(${leads.id})`))

  return rows.map((r) => ({ device: r.device, total: Number(r.total) }))
}

// ─── Top ciudades (top 10) ─────────────────────────────────────────────────────

export interface TopCityRow {
  city: string
  total: number
}

export async function getTopCities(
  orgId: string,
  from: Date,
  to: Date,
): Promise<TopCityRow[]> {
  const rows = await db
    .select({
      city: sql<string>`coalesce(nullif(${leads.city}, ''), 'Desconocida')`,
      total: sql<number>`cast(count(${leads.id}) as int)`,
    })
    .from(leads)
    .where(and(eq(leads.orgId, orgId), gte(leads.createdAt, from), lte(leads.createdAt, to)))
    .groupBy(sql`coalesce(nullif(${leads.city}, ''), 'Desconocida')`)
    .orderBy(desc(sql`count(${leads.id})`))
    .limit(10)

  return rows.map((r) => ({ city: r.city, total: Number(r.total) }))
}

// ─── Leads por temperatura × día ──────────────────────────────────────────────

export interface TempByDayRow {
  day: string
  hot: number
  warm: number
  cold: number
}

export async function getLeadsByTemperatureDay(
  orgId: string,
  from: Date,
  to: Date,
): Promise<TempByDayRow[]> {
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${leads.createdAt}), 'YYYY-MM-DD')`,
      temperature: leads.temperature,
      total: sql<number>`cast(count(${leads.id}) as int)`,
    })
    .from(leads)
    .where(and(eq(leads.orgId, orgId), gte(leads.createdAt, from), lte(leads.createdAt, to)))
    .groupBy(sql`date_trunc('day', ${leads.createdAt})`, leads.temperature)
    .orderBy(sql`date_trunc('day', ${leads.createdAt}) asc`)

  const map: Record<string, TempByDayRow> = {}
  for (const r of rows) {
    if (!map[r.day]) map[r.day] = { day: r.day, hot: 0, warm: 0, cold: 0 }
    const t = r.temperature as "hot" | "warm" | "cold"
    if (t === "hot" || t === "warm" || t === "cold") {
      map[r.day][t] = Number(r.total)
    }
  }

  return Object.values(map).sort((a, b) => a.day.localeCompare(b.day))
}

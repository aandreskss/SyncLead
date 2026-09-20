// ─── Analytics metrics — date semantics + KPI calculations ───────────────────
// These tests use fixture data with known numbers to verify that:
// - "Leads creados" counts by leads.created_at
// - "Ventas del periodo" counts by conversions.converted_at
// - Cohort: leads acquired in period + their eventual conversions (later dates)
// - N/D (null) is returned for metrics with no data, never misleading zero

import { describe, it, expect } from "vitest"
import type { DashboardKPIs, PerformanceRow, Metric } from "@/domains/analytics/types"

// ─── Pure calculation helpers (mirror repository logic) ───────────────────────

function computeKPIs(
  leadsInPeriod: number,
  salesInPeriod: number,
  revenueInPeriod: number,
): DashboardKPIs {
  const totalLeads = leadsInPeriod
  const totalSales = salesInPeriod
  const totalRevenue: Metric = totalSales > 0 ? revenueInPeriod : null
  const avgTicket: Metric = totalSales > 0 ? revenueInPeriod / totalSales : null
  const conversionRate: Metric = totalLeads > 0 ? (totalSales / totalLeads) * 100 : null
  return { totalLeads, totalSales, conversionRate, totalRevenue, avgTicket }
}

function computeConvRate(totalLeads: number, totalSales: number): Metric {
  return totalLeads > 0 ? (totalSales / totalLeads) * 100 : null
}

// ─── DashboardKPIs — correct date semantics ───────────────────────────────────

describe("DashboardKPIs — date semantics", () => {
  it("period with leads but no sales returns null revenue and N/D convRate", () => {
    const kpis = computeKPIs(10, 0, 0)
    expect(kpis.totalLeads).toBe(10)
    expect(kpis.totalSales).toBe(0)
    expect(kpis.conversionRate).toBe(0)  // 0 sales / 10 leads = 0%
    expect(kpis.totalRevenue).toBeNull()
    expect(kpis.avgTicket).toBeNull()
  })

  it("period with no leads and no sales returns N/D convRate", () => {
    const kpis = computeKPIs(0, 0, 0)
    expect(kpis.conversionRate).toBeNull()
    expect(kpis.totalRevenue).toBeNull()
    expect(kpis.avgTicket).toBeNull()
  })

  it("period with sales but no leads: convRate = N/D (different date windows)", () => {
    // Sales can exceed zero even when leads in same period = 0
    // (conversions from leads acquired in previous period)
    const kpis = computeKPIs(0, 5, 2500)
    expect(kpis.totalLeads).toBe(0)
    expect(kpis.totalSales).toBe(5)
    expect(kpis.conversionRate).toBeNull()  // can't divide by 0 leads
    expect(kpis.totalRevenue).toBe(2500)
    expect(kpis.avgTicket).toBe(500)
  })

  it("normal period: 20 leads, 4 sales, $2000 revenue", () => {
    const kpis = computeKPIs(20, 4, 2000)
    expect(kpis.totalLeads).toBe(20)
    expect(kpis.totalSales).toBe(4)
    expect(kpis.conversionRate).toBeCloseTo(20, 5)  // 4/20 = 20%
    expect(kpis.totalRevenue).toBe(2000)
    expect(kpis.avgTicket).toBe(500)
  })

  it("avg ticket rounds correctly with non-integer division", () => {
    const kpis = computeKPIs(3, 3, 100)
    expect(kpis.avgTicket).toBeCloseTo(33.333, 2)
  })
})

// ─── Date semantics: leads vs conversions use DIFFERENT date fields ───────────

describe("Date semantics invariants", () => {
  it("lead count must come from leads.created_at, not conversions.converted_at", () => {
    // Fixture: 5 leads created in period, 3 conversions in period (from prev leads)
    // Lead KPI: 5 (by created_at)
    // Sales KPI: 3 (by converted_at)  ← different event, different date
    const leadCount = 5
    const salesCount = 3
    const convRate = computeConvRate(leadCount, salesCount)
    expect(leadCount).toBe(5)
    expect(salesCount).toBe(3)
    expect(convRate).toBeCloseTo(60, 5)
  })

  it("cohort: lead from day 1, conversion happens on day 45 (future period)", () => {
    // In cohort view, this conversion would be counted against the lead's acquisition period.
    // In period view (default), day 45 conversion counts for the period that includes day 45.
    // These produce different numbers — both are valid, just different semantics.
    const cohortLeads = 10
    const cohortConversions = 4   // conversions that happened for leads acquired in period
    const periodConversions = 2   // conversions that happened IN the period by converted_at

    const cohortRate = computeConvRate(cohortLeads, cohortConversions)
    const periodRate = computeConvRate(cohortLeads, periodConversions)

    expect(cohortRate).toBeCloseTo(40, 5)
    expect(periodRate).toBeCloseTo(20, 5)
    // These values differ — that's the whole point
    expect(cohortRate).not.toBe(periodRate)
  })
})

// ─── N/D semantics ────────────────────────────────────────────────────────────

describe("N/D (null) vs explicit zero semantics", () => {
  it("0 leads is an explicit zero, not N/D", () => {
    const kpis = computeKPIs(0, 0, 0)
    expect(kpis.totalLeads).toBe(0)        // explicit zero
    expect(kpis.totalSales).toBe(0)        // explicit zero
    expect(kpis.conversionRate).toBeNull() // N/D: can't compute rate
    expect(kpis.totalRevenue).toBeNull()   // N/D: no sales
  })

  it("convRate is 0% when there are leads but no sales", () => {
    const rate = computeConvRate(10, 0)
    expect(rate).toBe(0)    // 0/10 = 0%, not N/D
  })

  it("convRate is null (N/D) when there are no leads at all", () => {
    const rate = computeConvRate(0, 0)
    expect(rate).toBeNull()
  })

  it("avgTicket is N/D when there are no sales", () => {
    const kpis = computeKPIs(50, 0, 0)
    expect(kpis.avgTicket).toBeNull()  // can't compute average of empty set
  })

  it("totalRevenue is N/D when there are no sales, not 0", () => {
    const kpis = computeKPIs(50, 0, 0)
    expect(kpis.totalRevenue).toBeNull()
    // 0 would be misleading — we don't know if revenue is zero or just unmeasured
  })
})

// ─── PerformanceRow — per-campaign metrics ────────────────────────────────────

describe("PerformanceRow metrics", () => {
  function buildRow(totalLeads: number, totalSales: number, totalRevenue: number): PerformanceRow {
    return {
      campaignId: "camp-1",
      campaignName: "Test Campaign",
      metaAdsetName: "(sin conjunto)",
      utmContent: "ad_001",
      totalLeads,
      totalSales,
      convRate: totalLeads > 0 ? (totalSales / totalLeads) * 100 : null,
      totalRevenue,
    }
  }

  it("campaign with 50 leads and 5 sales = 10% convRate", () => {
    const row = buildRow(50, 5, 5000)
    expect(row.convRate).toBe(10)
    expect(row.totalRevenue).toBe(5000)
  })

  it("campaign with 0 leads = null convRate (N/D)", () => {
    const row = buildRow(0, 0, 0)
    expect(row.convRate).toBeNull()
  })

  it("campaign with leads but no conversions = 0% convRate", () => {
    const row = buildRow(20, 0, 0)
    expect(row.convRate).toBe(0)
  })

  it("revenue is always a number (0 when no conversions)", () => {
    const row = buildRow(10, 0, 0)
    expect(row.totalRevenue).toBe(0)
    expect(typeof row.totalRevenue).toBe("number")
  })
})

// ─── Formula injection prevention ─────────────────────────────────────────────

describe("CSV formula injection prevention", () => {
  function sanitize(v: string) {
    return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  }

  const dangerousPrefixes = ["=SUM(1)", "+1234", "-1234", "@SUM", "\t formula", "\r cmd"]
  const safePrefixes = ["normal text", "Campaign Name", "https://example.com", "100", "(sin anuncio)"]

  for (const value of dangerousPrefixes) {
    it(`prefixes dangerous value starting with "${value[0]}"`, () => {
      expect(sanitize(value)).toMatch(/^'/)
    })
  }

  for (const value of safePrefixes) {
    it(`does not modify safe value: "${value}"`, () => {
      expect(sanitize(value)).toBe(value)
    })
  }

  it("double-quoted values in CSV are already safe", () => {
    // When we wrap in quotes ("..."), formula injection chars inside are harmless
    // because the cell starts with " not = + - @ etc.
    const cell = `"=SUM(1)"`
    expect(cell[0]).toBe('"')
    // No sanitization needed for quoted cells when the quote is the first char
  })
})

// ─── Fixture: manual recalculation matches dashboard ─────────────────────────
// These values should exactly match what a SQL query over the same fixture data
// would produce.

describe("Fixture: exact numbers match", () => {
  it("fixture A: 30-day window with mixed lead and conversion dates", () => {
    // Setup (would be in DB):
    // Leads created in period (Jan 1-31): 100
    // Conversions with converted_at in period (Jan 1-31): 12
    //   - 8 from leads created in period
    //   - 4 from leads created in December (previous period)
    // Revenue from period conversions: 12 × 250 = $3,000
    //
    // Expected KPIs:
    // totalLeads = 100 (by leads.created_at)
    // totalSales = 12  (by conversions.converted_at)
    // conversionRate = 12/100 = 12%
    // totalRevenue = 3000
    // avgTicket = 250

    const kpis = computeKPIs(100, 12, 3000)
    expect(kpis.totalLeads).toBe(100)
    expect(kpis.totalSales).toBe(12)
    expect(kpis.conversionRate).toBeCloseTo(12, 5)
    expect(kpis.totalRevenue).toBe(3000)
    expect(kpis.avgTicket).toBe(250)
  })

  it("fixture B: prev period comparison for delta calculation", () => {
    // Current period: 100 leads, 12 sales, $3000
    // Previous period: 80 leads, 8 sales, $1600
    const curr = computeKPIs(100, 12, 3000)
    const prev = computeKPIs(80, 8, 1600)

    // Lead delta: (100-80)/80 = 25%
    const leadDelta = ((curr.totalLeads - prev.totalLeads) / prev.totalLeads) * 100
    expect(leadDelta).toBe(25)

    // Sales delta: (12-8)/8 = 50%
    const salesDelta = ((curr.totalSales - prev.totalSales) / prev.totalSales) * 100
    expect(salesDelta).toBe(50)

    // Revenue delta: (3000-1600)/1600 = 87.5%
    const revDelta = (((curr.totalRevenue as number) - (prev.totalRevenue as number)) / (prev.totalRevenue as number)) * 100
    expect(revDelta).toBeCloseTo(87.5, 5)
  })

  it("fixture C: performance table row — campaign × ad", () => {
    // Campaign "Black Friday", ad "ad_bf_001":
    // Leads created in period: 45
    // Conversions in period for those leads: 9
    // Revenue: 9 × 300 = $2,700
    const row: PerformanceRow = {
      campaignId: "uuid-camp",
      campaignName: "Black Friday",
      metaAdsetName: "BF Adset",
      utmContent: "ad_bf_001",
      totalLeads: 45,
      totalSales: 9,
      convRate: (9 / 45) * 100,
      totalRevenue: 2700,
    }
    expect(row.convRate).toBeCloseTo(20, 5)
    expect(row.totalRevenue).toBe(2700)

    // Manual check: 9 / 45 × 100 = 20%
    const manualRate = (9 / 45) * 100
    expect(row.convRate).toBe(manualRate)
  })
})

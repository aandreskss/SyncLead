// null = N/D: metric cannot be computed (no data / divide by zero)
// 0 is an explicit, meaningful zero — distinct from N/D
export type Metric = number | null

export interface DashboardKPIs {
  totalLeads: number      // leads.created_at in period
  totalSales: number      // confirmed conversions by converted_at in period
  conversionRate: Metric  // null when totalLeads = 0
  totalRevenue: Metric    // null when totalSales = 0
  avgTicket: Metric       // null when totalSales = 0
}

export interface PerformanceRow {
  campaignId: string
  campaignName: string
  metaAdsetName: string
  utmContent: string
  totalLeads: number
  totalSales: number
  convRate: Metric  // null when totalLeads = 0
  totalRevenue: number
}

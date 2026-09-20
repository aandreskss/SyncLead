import { Trophy, TrendingUp, TrendingDown } from "lucide-react"
import type { PerformanceRow, Metric } from "@/domains/analytics/types"

interface Props {
  rows: PerformanceRow[]
}

function bestByRate(rows: PerformanceRow[], min = 3) {
  return rows
    .filter((r) => r.totalLeads >= min && r.convRate !== null)
    .sort((a, b) => (b.convRate as number) - (a.convRate as number))[0] ?? null
}

function worstByRate(rows: PerformanceRow[], min = 3) {
  return rows
    .filter((r) => r.totalLeads >= min && r.convRate !== null)
    .sort((a, b) => (a.convRate as number) - (b.convRate as number))[0] ?? null
}

function bestCampaign(rows: PerformanceRow[], min = 3) {
  const grouped: Record<string, { campaignId: string; totalLeads: number; totalSales: number; totalRevenue: number }> = {}
  for (const r of rows) {
    if (!grouped[r.campaignId]) {
      grouped[r.campaignId] = { campaignId: r.campaignId, totalLeads: 0, totalSales: 0, totalRevenue: 0 }
    }
    grouped[r.campaignId].totalLeads += r.totalLeads
    grouped[r.campaignId].totalSales += r.totalSales
    grouped[r.campaignId].totalRevenue += r.totalRevenue
  }
  const entries = Object.entries(grouped)
    .filter(([, v]) => v.totalLeads >= min)
    .map(([, v]) => {
      const name = rows.find((r) => r.campaignId === v.campaignId)?.campaignName ?? v.campaignId
      const convRate: Metric = v.totalLeads > 0 ? (v.totalSales / v.totalLeads) * 100 : null
      return { name, ...v, convRate }
    })
  return entries.sort((a, b) => b.totalLeads - a.totalLeads)[0] ?? null
}

function fmtRate(m: Metric) {
  return m !== null ? `${m.toFixed(1)}%` : "N/D"
}

export function SummaryCards({ rows }: Props) {
  const top = bestByRate(rows)
  const worst = worstByRate(rows)
  const camp = bestCampaign(rows)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Mejor campaña</span>
        </div>
        {camp ? (
          <>
            <p className="font-semibold text-zinc-100 truncate">{camp.name}</p>
            <p className="text-xs text-zinc-500 mt-1">
              {camp.totalLeads} leads · {fmtRate(camp.convRate)} conversión
            </p>
          </>
        ) : (
          <p className="text-zinc-600 text-sm">Sin datos suficientes</p>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Mejor anuncio</span>
        </div>
        {top ? (
          <>
            <p className="font-semibold text-zinc-100 truncate">{top.utmContent}</p>
            <p className="text-xs text-zinc-500 mt-1">
              {top.totalLeads} leads · {fmtRate(top.convRate)} conversión
            </p>
            <p className="text-xs text-zinc-600 mt-0.5">{top.campaignName}</p>
          </>
        ) : (
          <p className="text-zinc-600 text-sm">Sin datos suficientes</p>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown className="h-4 w-4 text-red-400" />
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Peor anuncio</span>
        </div>
        {worst && worst !== top ? (
          <>
            <p className="font-semibold text-zinc-100 truncate">{worst.utmContent}</p>
            <p className="text-xs text-zinc-500 mt-1">
              {worst.totalLeads} leads · {fmtRate(worst.convRate)} conversión
            </p>
            <p className="text-xs text-zinc-600 mt-0.5">{worst.campaignName}</p>
          </>
        ) : (
          <p className="text-zinc-600 text-sm">Sin datos suficientes</p>
        )}
      </div>
    </div>
  )
}

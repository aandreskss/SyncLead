import type React from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import type { DashboardKPIs, Metric } from "@/domains/analytics/types"

interface Props {
  current: DashboardKPIs
  prev: DashboardKPIs
}

function delta(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null) return null
  if (prev === 0) return curr > 0 ? 100 : 0
  return ((curr - prev) / prev) * 100
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null
  const abs = Math.abs(pct)
  if (abs < 0.5)
    return (
      <span className="flex items-center gap-0.5 text-xs text-sg-subtle">
        <Minus className="h-3 w-3" aria-hidden="true" />0%
      </span>
    )
  if (pct > 0)
    return (
      <span className="flex items-center gap-0.5 text-xs text-sg-green">
        <TrendingUp className="h-3 w-3" aria-hidden="true" />+{abs.toFixed(0)}%
      </span>
    )
  return (
    <span className="flex items-center gap-0.5 text-xs text-sg-danger">
      <TrendingDown className="h-3 w-3" aria-hidden="true" />-{abs.toFixed(0)}%
    </span>
  )
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("es", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtMetric(m: Metric, decimals = 0, prefix = ""): string {
  if (m === null) return "N/D"
  return `${prefix}${fmt(m, decimals)}`
}

export function KPICards({ current, prev }: Props) {
  const cards = [
    {
      label: "Leads creados",
      value: fmt(current.totalLeads),
      delta: delta(current.totalLeads, prev.totalLeads),
      sub: `vs ${fmt(prev.totalLeads)} periodo anterior`,
    },
    {
      label: "Ventas del periodo",
      value: fmt(current.totalSales),
      delta: delta(current.totalSales, prev.totalSales),
      sub: `vs ${fmt(prev.totalSales)} periodo anterior`,
    },
    {
      label: "Tasa de conversión",
      value: fmtMetric(current.conversionRate, 1) + (current.conversionRate !== null ? "%" : ""),
      delta: delta(current.conversionRate, prev.conversionRate),
      sub: prev.conversionRate !== null
        ? `vs ${prev.conversionRate.toFixed(1)}% periodo anterior`
        : "vs N/D periodo anterior",
    },
    {
      label: "Ingresos del periodo",
      value: fmtMetric(current.totalRevenue, 2, "$ "),
      delta: delta(current.totalRevenue, prev.totalRevenue),
      sub: prev.totalRevenue !== null
        ? `vs $ ${fmt(prev.totalRevenue, 2)} periodo anterior`
        : "vs N/D periodo anterior",
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => (
        <div
          key={card.label}
          style={{ "--i": i } as React.CSSProperties}
          className="sg-rise rounded-2xl border border-sg-border bg-sg-s1 p-5 shadow-sg-raise"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-sg-muted">{card.label}</p>
          <p className="sg-tabular mb-1 mt-2 font-mono text-3xl font-semibold tracking-tight text-sg-ink">{card.value}</p>
          <div className="flex items-center gap-2">
            <DeltaBadge pct={card.delta} />
            <span className="truncate text-xs text-sg-subtle">{card.sub}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

import { Minus, TrendingDown, TrendingUp } from "lucide-react"
import type { DashboardKPIs, Metric } from "@/domains/analytics/types"
import { InfoTip } from "./InfoTip"
import { Sparkline } from "./Sparkline"
import { fmt, fmtMoney, fmtPct } from "./format"

interface Props {
  current: DashboardKPIs
  prev: DashboardKPIs
  /** Serie diaria del periodo actual (para microtendencias). */
  series: { total: number; converted: number }[]
}

/** null = no hay base comparable (periodo anterior vacío o sin dato). */
function delta(curr: Metric, prev: Metric): number | null {
  if (curr === null || prev === null || prev === 0) return null
  return ((curr - prev) / prev) * 100
}

function Delta({ pct, prevText }: { pct: number | null; prevText: string }) {
  if (pct === null) {
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-ops-tx3">
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        Sin datos comparables
      </span>
    )
  }
  const abs = Math.abs(pct)
  if (abs < 0.5) {
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-ops-tx2">
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        Sin cambios · {prevText}
      </span>
    )
  }
  const up = pct > 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`flex items-center gap-1.5 text-[13px] ${up ? "text-ops-green" : "text-ops-coral"}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="font-plex">
        {up ? "+" : "−"}
        {fmt(abs, 1)} %
      </span>
      <span className="truncate text-ops-tx3">{prevText}</span>
    </span>
  )
}

export function KPIStrip({ current, prev, series }: Props) {
  const convSeries = series.map((d) => (d.total > 0 ? (d.converted / d.total) * 100 : 0))
  const cards = [
    {
      label: "Leads captados",
      value: fmt(current.totalLeads),
      delta: delta(current.totalLeads, prev.totalLeads),
      prevText: `vs ${fmt(prev.totalLeads)} anterior`,
      tip: "Total de leads registrados en el periodo seleccionado.",
      spark: series.map((d) => d.total),
      color: "#4c7dff",
    },
    {
      label: "Ventas",
      value: fmt(current.totalSales),
      delta: delta(current.totalSales, prev.totalSales),
      prevText: `vs ${fmt(prev.totalSales)} anterior`,
      tip: "Ventas confirmadas dentro del periodo, por fecha de conversión.",
      spark: series.map((d) => d.converted),
      color: "#37c790",
    },
    {
      label: "Tasa de conversión",
      value: current.conversionRate === null ? "N/D" : fmtPct(current.conversionRate),
      delta: delta(current.conversionRate, prev.conversionRate),
      prevText: prev.conversionRate !== null ? `vs ${fmtPct(prev.conversionRate)} anterior` : "",
      tip: "Ventas divididas entre leads captados en el periodo.",
      spark: convSeries,
      color: "#98a4b3",
    },
    {
      label: "Ingresos atribuidos",
      value: current.totalRevenue === null ? "N/D" : fmtMoney(current.totalRevenue),
      delta: delta(current.totalRevenue, prev.totalRevenue),
      prevText: prev.totalRevenue !== null ? `vs ${fmtMoney(prev.totalRevenue)} anterior` : "",
      tip: "Suma del monto de las ventas confirmadas en el periodo.",
      spark: [] as number[],
      color: "#37c790",
    },
  ]

  return (
    <section aria-label="Métricas principales" className="grid grid-cols-2 rounded-lg border border-ops-line bg-ops-s1 lg:grid-cols-4">
      {cards.map((c, i) => (
        <div
          key={c.label}
          className={`min-w-0 p-4 lg:p-5 ${i % 2 === 0 ? "border-r border-ops-line" : ""} ${i < 2 ? "border-b border-ops-line lg:border-b-0" : ""} ${
            i < 3 ? "lg:border-r" : "lg:border-r-0"
          }`}
        >
          <div className="flex items-center gap-1 text-[13px] font-medium text-ops-tx2">
            {c.label}
            <InfoTip label={c.label} align={i % 4 === 3 ? "right" : i % 4 === 0 ? "left" : "center"}>
              {c.tip}
            </InfoTip>
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <p className="font-plex text-[26px] font-medium leading-none tracking-tight text-ops-tx lg:text-[32px]">{c.value}</p>
            <Sparkline points={c.spark} color={c.color} label={`Tendencia diaria de ${c.label.toLowerCase()}`} />
          </div>
          <div className="mt-2.5">
            <Delta pct={c.delta} prevText={c.prevText} />
          </div>
        </div>
      ))}
    </section>
  )
}

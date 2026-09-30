import { Minus, TrendingDown, TrendingUp, Users, ShoppingCart, BarChart2, DollarSign } from "lucide-react"
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ops-s2 px-2.5 py-1 text-[11px] font-semibold text-ops-tx3">
        <Minus className="h-3 w-3" aria-hidden="true" />
        Sin datos comparables
      </span>
    )
  }
  const abs = Math.abs(pct)
  if (abs < 0.5) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ops-s2 px-2.5 py-1 text-[11px] font-semibold text-ops-tx3">
        <Minus className="h-3 w-3" aria-hidden="true" />
        Sin cambios · {prevText}
      </span>
    )
  }
  const up = pct > 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${up ? "bg-ops-green-bg text-ops-green" : "bg-ops-coral-bg text-ops-coral"}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>
        {up ? "+" : "−"}
        {fmt(abs, 1)} %
      </span>
      <span className="truncate opacity-70">{prevText}</span>
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
      sparkColor: "#3E5CFA",
      icon: <Users className="h-5 w-5" aria-hidden="true" />,
      iconBg: "bg-ops-blue-bg",
      iconColor: "text-ops-blue",
    },
    {
      label: "Ventas",
      value: fmt(current.totalSales),
      delta: delta(current.totalSales, prev.totalSales),
      prevText: `vs ${fmt(prev.totalSales)} anterior`,
      tip: "Ventas confirmadas dentro del periodo, por fecha de conversión.",
      spark: series.map((d) => d.converted),
      sparkColor: "#12B48A",
      icon: <ShoppingCart className="h-5 w-5" aria-hidden="true" />,
      iconBg: "bg-ops-green-bg",
      iconColor: "text-ops-green",
    },
    {
      label: "Tasa de conversión",
      value: current.conversionRate === null ? "N/D" : fmtPct(current.conversionRate),
      delta: delta(current.conversionRate, prev.conversionRate),
      prevText: prev.conversionRate !== null ? `vs ${fmtPct(prev.conversionRate)} anterior` : "",
      tip: "Ventas divididas entre leads captados en el periodo.",
      spark: convSeries,
      sparkColor: "#E4A730",
      icon: <BarChart2 className="h-5 w-5" aria-hidden="true" />,
      iconBg: "bg-ops-amber-bg",
      iconColor: "text-ops-amber",
    },
    {
      label: "Ingresos atribuidos",
      value: current.totalRevenue === null ? "N/D" : fmtMoney(current.totalRevenue),
      delta: delta(current.totalRevenue, prev.totalRevenue),
      prevText: prev.totalRevenue !== null ? `vs ${fmtMoney(prev.totalRevenue)} anterior` : "",
      tip: "Suma del monto de las ventas confirmadas en el periodo.",
      spark: [] as number[],
      sparkColor: "#12B48A",
      icon: <DollarSign className="h-5 w-5" aria-hidden="true" />,
      iconBg: "bg-ops-green-bg",
      iconColor: "text-ops-green",
    },
  ]

  return (
    <section aria-label="Métricas principales" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c, i) => (
        <div
          key={c.label}
          className="min-w-0 rounded-[20px] border border-ops-line bg-ops-s1 p-5 shadow-ops-card"
        >
          <div className="flex items-start justify-between gap-2">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.iconBg} ${c.iconColor}`}>
              {c.icon}
            </span>
            <Sparkline points={c.spark} color={c.sparkColor} label={`Tendencia diaria de ${c.label.toLowerCase()}`} />
          </div>
          <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-ops-tx3">
            {c.label}
            <InfoTip label={c.label} align={i % 4 === 3 ? "right" : i % 4 === 0 ? "left" : "center"}>
              {c.tip}
            </InfoTip>
          </div>
          <p className="font-plex mt-1 text-[32px] font-bold leading-none tabular-nums text-ops-tx">{c.value}</p>
          <div className="mt-3">
            <Delta pct={c.delta} prevText={c.prevText} />
          </div>
        </div>
      ))}
    </section>
  )
}

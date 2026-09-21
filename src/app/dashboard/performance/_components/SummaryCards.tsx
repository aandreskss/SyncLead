import type { PerformanceRow, Metric } from "@/domains/analytics/types"

interface Props {
  rows: PerformanceRow[]
}

function fmtRate(m: Metric) {
  return m !== null ? `${m.toFixed(1)}%` : "N/D"
}

/** Franja de KPIs: un solo panel con 4 celdas separadas por bordes. */
export function SummaryCards({ rows }: Props) {
  const leads = rows.reduce((s, r) => s + r.totalLeads, 0)
  const sales = rows.reduce((s, r) => s + r.totalSales, 0)
  const revenue = rows.reduce((s, r) => s + r.totalRevenue, 0)
  const conv: Metric = leads > 0 ? (sales / leads) * 100 : null

  const cells: { label: string; value: string; hint?: string }[] = [
    { label: "Leads", value: leads.toLocaleString("es") },
    { label: "Ventas", value: sales.toLocaleString("es") },
    { label: "Conversión", value: fmtRate(conv), hint: "Ventas / leads" },
    { label: "Ingresos", value: `$${revenue.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ]

  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-ops-line bg-ops-s1 lg:grid-cols-4">
      {cells.map((c, i) => (
        <div
          key={c.label}
          className={`p-4 ${i % 2 === 1 ? "border-l border-ops-line" : ""} ${i > 1 ? "border-t border-ops-line lg:border-t-0" : ""} ${i > 0 ? "lg:border-l lg:border-ops-line" : ""}`}
        >
          <dt className="text-xs font-medium text-ops-tx3">{c.label}</dt>
          <dd className="mt-1 font-plex text-[26px] font-medium leading-tight tabular-nums text-ops-tx">{c.value}</dd>
          {c.hint ? <p className="mt-0.5 text-xs text-ops-tx3">{c.hint}</p> : null}
        </div>
      ))}
    </dl>
  )
}

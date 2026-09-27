import type { PerformanceRow, Metric } from "@/domains/analytics/types"
import type { MetaSpendSummary } from "@/domains/analytics/repository"

interface Props {
  rows: PerformanceRow[]
  metaSpend?: MetaSpendSummary | null
}

function fmtRate(m: Metric) {
  return m !== null ? `${m.toFixed(1)}%` : "N/D"
}

function fmtCurrency(n: number | null, currency?: string | null) {
  if (n === null) return "N/D"
  const cur = currency ?? "USD"
  return n.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + cur
}

function fmtROAS(n: number | null) {
  if (n === null) return "N/D"
  return `${n.toFixed(2)}x`
}

/** Franja de KPIs: leads/ventas/conversión/ingresos + CPL/CPA/ROAS cuando hay datos de Meta Insights. */
export function SummaryCards({ rows, metaSpend }: Props) {
  const leads = rows.reduce((s, r) => s + r.totalLeads, 0)
  const sales = rows.reduce((s, r) => s + r.totalSales, 0)
  const revenue = rows.reduce((s, r) => s + r.totalRevenue, 0)
  const conv: Metric = leads > 0 ? (sales / leads) * 100 : null

  const baseCells: { label: string; value: string; hint?: string }[] = [
    { label: "Leads", value: leads.toLocaleString("es") },
    { label: "Ventas", value: sales.toLocaleString("es") },
    { label: "Conversión", value: fmtRate(conv), hint: "Ventas / leads" },
    { label: "Ingresos", value: `$${revenue.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ]

  const hasMetaData = metaSpend !== null && metaSpend !== undefined && metaSpend.totalSpend > 0
  const spend = metaSpend?.totalSpend ?? 0
  const currency = metaSpend?.currency

  const cpl: number | null = hasMetaData && leads > 0 ? spend / leads : null
  const cpa: number | null = hasMetaData && sales > 0 ? spend / sales : null
  // ROAS: solo si moneda del gasto y moneda de ingresos son comparables (sin mezcla)
  const roas: number | null = hasMetaData && revenue > 0 ? revenue / spend : null

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-ops-line bg-ops-s1 lg:grid-cols-4">
        {baseCells.map((c, i) => (
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

      {hasMetaData && (
        <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-ops-line bg-ops-s1 lg:grid-cols-4">
          <div className="p-4">
            <dt className="text-xs font-medium text-ops-tx3">Gasto Meta</dt>
            <dd className="mt-1 font-plex text-[22px] font-medium leading-tight tabular-nums text-ops-tx">
              {fmtCurrency(spend, currency)}
            </dd>
            <p className="mt-0.5 text-xs text-ops-tx3">Meta Ads Insights</p>
          </div>
          <div className="border-l border-ops-line p-4">
            <dt className="text-xs font-medium text-ops-tx3">CPL</dt>
            <dd className="mt-1 font-plex text-[22px] font-medium leading-tight tabular-nums text-ops-tx">
              {fmtCurrency(cpl, currency)}
            </dd>
            <p className="mt-0.5 text-xs text-ops-tx3">Costo por lead</p>
          </div>
          <div className="border-l border-ops-line border-t border-ops-line p-4 lg:border-t-0">
            <dt className="text-xs font-medium text-ops-tx3">CPA</dt>
            <dd className="mt-1 font-plex text-[22px] font-medium leading-tight tabular-nums text-ops-tx">
              {fmtCurrency(cpa, currency)}
            </dd>
            <p className="mt-0.5 text-xs text-ops-tx3">Costo por venta</p>
          </div>
          <div className="border-l border-ops-line border-t border-ops-line p-4 lg:border-t-0">
            <dt className="text-xs font-medium text-ops-tx3">ROAS</dt>
            <dd className={`mt-1 font-plex text-[22px] font-medium leading-tight tabular-nums ${roas !== null && roas >= 1 ? "text-ops-green" : roas !== null ? "text-ops-coral" : "text-ops-tx"}`}>
              {fmtROAS(roas)}
            </dd>
            <p className="mt-0.5 text-xs text-ops-tx3">Retorno sobre inversión</p>
          </div>
        </dl>
      )}

      {!hasMetaData && (
        <p className="text-[11px] text-ops-tx3">
          Selecciona un cliente con Meta Ads Insights configurado para ver CPL, CPA y ROAS.
        </p>
      )}
    </div>
  )
}

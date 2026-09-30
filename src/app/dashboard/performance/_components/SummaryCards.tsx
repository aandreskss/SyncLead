import {
  Users, TrendingUp, DollarSign, ShoppingCart,
  Zap, Target, BarChart3, ArrowUpRight,
} from "lucide-react"
import type { PerformanceRow, Metric } from "@/domains/analytics/types"
import type { MetaSpendSummary } from "@/domains/analytics/repository"

interface Props {
  rows: PerformanceRow[]
  metaSpend?: MetaSpendSummary | null
}

function fmtBig(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString("es")
}

function fmtMoney(n: number | null, currency?: string | null): string {
  if (n === null) return "N/D"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ${currency ?? "USD"}`
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k ${currency ?? "USD"}`
  return n.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + (currency ?? "USD")
}

function fmtROAS(n: number | null): string {
  if (n === null) return "N/D"
  return `${n.toFixed(2)}x`
}

function convColor(conv: Metric): string {
  if (conv === null) return "text-ops-tx3"
  if (conv >= 10) return "text-ops-green"
  if (conv >= 5) return "text-ops-amber"
  return "text-ops-blue-t"
}

function roasColor(roas: number | null): string {
  if (roas === null) return "text-ops-tx"
  if (roas >= 2) return "text-ops-green"
  if (roas >= 1) return "text-ops-amber"
  return "text-ops-coral"
}

function roasBg(roas: number | null): string {
  if (roas === null) return "bg-ops-s2"
  if (roas >= 2) return "bg-ops-green/10"
  if (roas >= 1) return "bg-ops-amber/10"
  return "bg-ops-coral/10"
}

function roasBorder(roas: number | null): string {
  if (roas === null) return "border-ops-line"
  if (roas >= 2) return "border-ops-green/30"
  if (roas >= 1) return "border-ops-amber/30"
  return "border-ops-coral/30"
}

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  accent?: string
}

function KpiCard({ label, value, sub, icon, iconBg, iconColor, accent }: KpiCardProps) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-ops-line bg-ops-s1 p-5 ${accent ? `border-l-2 ${accent}` : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-ops-tx3 uppercase">{label}</p>
          <p className="mt-2 text-[28px] font-bold leading-none tabular-nums text-ops-tx tracking-tight">
            {value}
          </p>
          {sub && <p className="mt-1.5 text-xs text-ops-tx3">{sub}</p>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

interface MetaKpiProps {
  label: string
  value: string
  sub?: string
  roas?: number | null
  highlight?: boolean
}

function MetaKpi({ label, value, sub, roas, highlight }: MetaKpiProps) {
  const isRoas = roas !== undefined
  return (
    <div className={`rounded-xl border p-4 ${isRoas ? roasBg(roas) + " " + roasBorder(roas) : "border-ops-line/60 bg-ops-s1/60"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ops-tx3">{label}</p>
      <p className={`mt-1.5 text-xl font-bold tabular-nums leading-tight ${isRoas ? roasColor(roas) : highlight ? "text-ops-tx" : "text-ops-tx"}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-ops-tx3">{sub}</p>}
    </div>
  )
}

export function SummaryCards({ rows, metaSpend }: Props) {
  const leads = rows.reduce((s, r) => s + r.totalLeads, 0)
  const sales = rows.reduce((s, r) => s + r.totalSales, 0)
  const revenue = rows.reduce((s, r) => s + r.totalRevenue, 0)
  const conv: Metric = leads > 0 ? (sales / leads) * 100 : null

  const hasMetaData = metaSpend !== null && metaSpend !== undefined && metaSpend.totalSpend > 0
  const spend = metaSpend?.totalSpend ?? 0
  const currency = metaSpend?.currency

  const cpl: number | null = hasMetaData && leads > 0 ? spend / leads : null
  const cpa: number | null = hasMetaData && sales > 0 ? spend / sales : null
  const roas: number | null = hasMetaData && revenue > 0 ? revenue / spend : null

  return (
    <div className="space-y-4">
      {/* Primary KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Leads captados"
          value={fmtBig(leads)}
          icon={<Users className="h-4.5 w-4.5" />}
          iconBg="bg-ops-blue/12"
          iconColor="text-ops-blue"
          accent="border-l-ops-blue/60"
        />
        <KpiCard
          label="Ventas cerradas"
          value={fmtBig(sales)}
          icon={<ShoppingCart className="h-4.5 w-4.5" />}
          iconBg="bg-ops-green/12"
          iconColor="text-ops-green"
          accent="border-l-ops-green/60"
        />
        <KpiCard
          label="Conversión"
          value={conv !== null ? `${conv.toFixed(1)}%` : "—"}
          sub={conv !== null ? "ventas ÷ leads" : "sin ventas aún"}
          icon={<TrendingUp className="h-4.5 w-4.5" />}
          iconBg={conv !== null && conv >= 5 ? "bg-ops-green/12" : "bg-ops-amber/12"}
          iconColor={conv !== null ? convColor(conv) : "text-ops-tx3"}
          accent={conv !== null && conv >= 5 ? "border-l-ops-green/60" : conv !== null ? "border-l-ops-amber/60" : ""}
        />
        <KpiCard
          label="Ingresos"
          value={revenue >= 10000 ? `$${fmtBig(revenue)}` : `$${revenue.toLocaleString("es", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          sub={sales > 0 ? `avg $${(revenue / sales).toFixed(0)} por venta` : undefined}
          icon={<DollarSign className="h-4.5 w-4.5" />}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-400"
          accent={revenue > 0 ? "border-l-emerald-500/50" : ""}
        />
      </div>

      {/* Meta Ads row */}
      {hasMetaData ? (
        <div className="rounded-xl border border-blue-900/30 bg-blue-950/20 p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-blue-600/20">
              <BarChart3 className="h-3 w-3 text-blue-400" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-blue-400/80">
              Meta Ads Insights
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetaKpi
              label="Gasto"
              value={fmtMoney(spend, currency)}
              sub="inversión total"
            />
            <MetaKpi
              label="CPL"
              value={cpl !== null ? fmtMoney(cpl, currency) : "—"}
              sub="costo por lead"
            />
            <MetaKpi
              label="CPA"
              value={cpa !== null ? fmtMoney(cpa, currency) : "—"}
              sub="costo por venta"
            />
            <MetaKpi
              label="ROAS"
              value={fmtROAS(roas)}
              sub={
                roas === null ? "sin ventas"
                  : roas >= 2 ? "excelente ✓"
                  : roas >= 1 ? "positivo"
                  : "negativo ✗"
              }
              roas={roas}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-lg border border-ops-line/40 bg-ops-s1/40 px-4 py-2.5">
          <Zap className="h-3.5 w-3.5 text-ops-tx3 shrink-0" />
          <p className="text-xs text-ops-tx3">
            Conecta <span className="text-ops-tx2 font-medium">Meta Ads Insights</span> en la configuración del cliente para ver CPL, CPA y ROAS.
          </p>
          <ArrowUpRight className="h-3.5 w-3.5 text-ops-tx3 shrink-0 ml-auto" />
        </div>
      )}
    </div>
  )
}

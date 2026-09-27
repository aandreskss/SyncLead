import Link from "next/link"
import { BarChart3, AlertCircle, CheckCircle2, Clock, ArrowRight, TrendingUp, MousePointerClick, Eye, DollarSign } from "lucide-react"
import type { InsightsConnectionPublic, InsightsSummary, InsightsTableRow, SyncRunPublic, InsightsLevel } from "@/domains/meta-insights/types"
import { InsightsSyncButton } from "./InsightsSyncButton"

function fmtCurrency(amount: number, currency: string | null): string {
  const sym = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$"
  return `${sym}${amount.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtNum(n: number): string {
  return n.toLocaleString("es")
}

function relativeTime(date: Date | null | string): string {
  if (!date) return "—"
  const d = date instanceof Date ? date : new Date(date)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "hace un momento"
  if (diffMin < 60) return `hace ${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `hace ${diffH}h`
  return `hace ${Math.floor(diffH / 24)}d`
}

function ctr(clicks: number, impressions: number): string {
  if (impressions === 0) return "—"
  return `${((clicks / impressions) * 100).toFixed(2)}%`
}

interface Props {
  clientId: string
  connections: InsightsConnectionPublic[]
  activeConn: InsightsConnectionPublic | null
  summary: InsightsSummary | null
  tableRows: InsightsTableRow[]
  lastRun: SyncRunPublic | null
  days: number
  level: InsightsLevel
}

const LEVEL_LABELS: Record<InsightsLevel, string> = {
  campaign: "Campaña",
  adset: "Conjunto de anuncios",
  ad: "Anuncio",
}

export function InsightsTab({
  clientId,
  connections,
  activeConn,
  summary,
  tableRows,
  lastRun,
  days,
  level,
}: Props) {
  if (!activeConn) {
    return (
      <div className="rounded-xl border border-ops-line bg-ops-s1 px-6 py-16 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-ops-s2 border border-ops-bd">
          <BarChart3 className="h-6 w-6 text-ops-tx3" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ops-tx">Conecta tu cuenta de Meta Ads</p>
          <p className="text-xs text-ops-tx3 max-w-sm mx-auto">
            Sincroniza gasto, impresiones, clics, CPL y ROAS directamente desde Meta Ads Manager.
          </p>
        </div>
        <Link
          href={`/dashboard/clients/${clientId}?tab=configuracion`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ops-bd bg-ops-s2 px-4 py-2 text-xs font-medium text-ops-tx2 hover:text-ops-tx hover:border-ops-bd2 transition-colors"
        >
          Ir a Configuración
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    )
  }

  const hasData = summary && summary.totalImpressions > 0
  const currency = summary?.currency ?? null

  const DAYS_OPTIONS = [
    { value: 7,  label: "7d" },
    { value: 30, label: "30d" },
    { value: 90, label: "90d" },
  ]

  const LEVELS: { value: InsightsLevel; label: string }[] = [
    { value: "campaign", label: "Campaña" },
    { value: "adset",    label: "Conjunto" },
    { value: "ad",       label: "Anuncio" },
  ]

  function tabUrl(overrides: Record<string, string | number>) {
    const p = new URLSearchParams({ tab: "insights", days: String(days), level })
    for (const [k, v] of Object.entries(overrides)) p.set(k, String(v))
    return `/dashboard/clients/${clientId}?${p}`
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ops-tx">Meta Ads Insights</p>
            {activeConn.status === "active"
              ? <CheckCircle2 className="h-3.5 w-3.5 text-ops-green" />
              : <AlertCircle className="h-3.5 w-3.5 text-ops-coral" />}
            <span className="font-mono text-xs text-ops-tx3">{activeConn.adAccountId}</span>
          </div>
          <p className="text-xs text-ops-tx3 mt-0.5 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {lastRun?.completedAt
              ? `Última sincronización ${relativeTime(lastRun.completedAt)} · ${lastRun.recordsSynced} registros`
              : "Sin sincronización aún"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <InsightsSyncButton
            clientId={clientId}
            connectionId={activeConn.id}
            syncType="incremental"
            label="Actualizar"
          />
          {!hasData && (
            <InsightsSyncButton
              clientId={clientId}
              connectionId={activeConn.id}
              syncType="initial"
              label="Carga inicial (90d)"
              variant="primary"
            />
          )}
        </div>
      </div>

      {/* Sync error */}
      {lastRun?.status === "failed" && lastRun.error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/10 px-3 py-2.5">
          <AlertCircle className="h-3.5 w-3.5 text-ops-coral shrink-0 mt-0.5" />
          <p className="text-xs text-ops-coral">{lastRun.error}</p>
        </div>
      )}

      {/* No data state */}
      {!hasData && (
        <div className="rounded-lg border border-ops-bd bg-ops-s2/40 px-4 py-10 text-center space-y-2">
          <TrendingUp className="h-7 w-7 text-ops-tx3 mx-auto" />
          <p className="text-sm text-ops-tx3">Sin datos en este período</p>
          <p className="text-xs text-ops-tx3">
            {lastRun
              ? "Ejecuta una carga inicial para traer los últimos 90 días."
              : "Conecta y ejecuta la sincronización inicial para importar datos."}
          </p>
        </div>
      )}

      {/* KPI cards */}
      {hasData && summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Gasto",
              value: fmtCurrency(summary.totalSpend, currency),
              icon: DollarSign,
              sub: `${days}d`,
            },
            {
              label: "Impresiones",
              value: fmtNum(summary.totalImpressions),
              icon: Eye,
              sub: null,
            },
            {
              label: "Clics",
              value: fmtNum(summary.totalClicks),
              icon: MousePointerClick,
              sub: summary.totalImpressions > 0
                ? `${((summary.totalClicks / summary.totalImpressions) * 100).toFixed(2)}% CTR`
                : null,
            },
            {
              label: "CPL",
              value: summary.cpl != null ? fmtCurrency(summary.cpl, currency) : "—",
              icon: TrendingUp,
              sub: summary.totalLeads > 0 ? `${summary.totalLeads} leads` : "Sin leads asignados",
            },
          ].map(({ label, value, icon: Icon, sub }) => (
            <div key={label} className="rounded-lg border border-ops-line bg-ops-s1 p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className="h-3.5 w-3.5 text-ops-tx3" />
                <p className="text-xs text-ops-tx3">{label}</p>
              </div>
              <p className="text-xl font-bold text-ops-tx">{value}</p>
              {sub && <p className="text-xs text-ops-tx3 mt-0.5">{sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Controls: days + level */}
      {hasData && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Days filter */}
          <div className="flex items-center gap-1 rounded-lg border border-ops-line bg-ops-s1 p-1">
            {DAYS_OPTIONS.map((opt) => (
              <Link
                key={opt.value}
                href={tabUrl({ days: opt.value })}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  days === opt.value
                    ? "bg-ops-sel text-ops-tx"
                    : "text-ops-tx3 hover:text-ops-tx2"
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>

          {/* Level filter */}
          <div className="flex items-center gap-1 rounded-lg border border-ops-line bg-ops-s1 p-1">
            {LEVELS.map((opt) => (
              <Link
                key={opt.value}
                href={tabUrl({ level: opt.value })}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  level === opt.value
                    ? "bg-ops-sel text-ops-tx"
                    : "text-ops-tx3 hover:text-ops-tx2"
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Performance table */}
      {hasData && tableRows.length > 0 && (
        <div className="rounded-lg border border-ops-line bg-ops-s1 overflow-hidden">
          <div className="border-b border-ops-line px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ops-tx3">
              {LEVEL_LABELS[level]}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ops-line/60 bg-ops-s2/30">
                  <th className="px-4 py-2.5 text-left font-medium text-ops-tx3">Nombre</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ops-tx3">Gasto</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ops-tx3 hidden sm:table-cell">Impr.</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ops-tx3 hidden sm:table-cell">Clics</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ops-tx3 hidden md:table-cell">CTR</th>
                  <th className="px-4 py-2.5 text-right font-medium text-ops-tx3">Conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ops-line/40">
                {tableRows.map((row, i) => (
                  <tr key={row.entityId ?? i} className="hover:bg-ops-s2/40 transition-colors">
                    <td className="px-4 py-3 text-ops-tx max-w-[200px]">
                      <p className="truncate font-medium">{row.name ?? row.entityId ?? "—"}</p>
                      {row.entityId && (
                        <p className="text-[10px] text-ops-tx3 font-mono truncate">{row.entityId}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ops-tx tabular-nums">
                      {fmtCurrency(row.spend, row.currency)}
                    </td>
                    <td className="px-4 py-3 text-right text-ops-tx2 tabular-nums hidden sm:table-cell">
                      {fmtNum(row.impressions)}
                    </td>
                    <td className="px-4 py-3 text-right text-ops-tx2 tabular-nums hidden sm:table-cell">
                      {fmtNum(row.clicks)}
                    </td>
                    <td className="px-4 py-3 text-right text-ops-tx2 tabular-nums hidden md:table-cell">
                      {ctr(row.clicks, row.impressions)}
                    </td>
                    <td className="px-4 py-3 text-right text-ops-tx2 tabular-nums">
                      {fmtNum(row.conversions)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Totals row */}
              <tfoot className="border-t border-ops-line bg-ops-s2/30">
                <tr>
                  <td className="px-4 py-2.5 text-xs font-semibold text-ops-tx3">Total</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-ops-tx tabular-nums">
                    {fmtCurrency(tableRows.reduce((s, r) => s + r.spend, 0), currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold text-ops-tx2 tabular-nums hidden sm:table-cell">
                    {fmtNum(tableRows.reduce((s, r) => s + r.impressions, 0))}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold text-ops-tx2 tabular-nums hidden sm:table-cell">
                    {fmtNum(tableRows.reduce((s, r) => s + r.clicks, 0))}
                  </td>
                  <td className="hidden md:table-cell" />
                  <td className="px-4 py-2.5 text-right text-xs font-semibold text-ops-tx2 tabular-nums">
                    {fmtNum(tableRows.reduce((s, r) => s + r.conversions, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Connection management */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-ops-tx3 hover:text-ops-tx2 transition-colors list-none flex items-center gap-1">
          <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
          Gestión de conexiones
        </summary>
        <div className="mt-3 space-y-2">
          {connections.map((conn) => (
            <div key={conn.id} className="flex items-center justify-between rounded-lg border border-ops-bd/60 bg-ops-s2/30 px-3 py-2.5">
              <div className="flex items-center gap-2">
                {conn.status === "active"
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-ops-green shrink-0" />
                  : <AlertCircle className="h-3.5 w-3.5 text-ops-amber shrink-0" />}
                <div>
                  <p className="text-xs font-mono text-ops-tx">{conn.adAccountId ?? "—"}</p>
                  {conn.lastError && <p className="text-[10px] text-ops-coral">{conn.lastError}</p>}
                </div>
              </div>
              {conn.status === "active" && conn.adAccountId && (
                <InsightsSyncButton
                  clientId={clientId}
                  connectionId={conn.id}
                  syncType="incremental"
                  label="Sync"
                />
              )}
            </div>
          ))}
          <Link
            href={`/dashboard/clients/${clientId}?tab=configuracion`}
            className="inline-flex items-center gap-1 text-xs text-ops-tx3 hover:text-ops-tx2 transition-colors"
          >
            Agregar o editar conexión
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </details>
    </div>
  )
}

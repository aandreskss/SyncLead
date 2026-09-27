import Link from "next/link"
import {
  getActiveInsightsConnection,
  getCampaignMetrics,
  getAccountMetrics,
  getAdMetrics,
  getLeadCampaignData,
  getLastSyncInfo,
  type CampaignMetricsRow,
  type AdMetricsRow,
  type LeadCampaignRow,
} from "@/domains/meta-insights/decision-repository"
import {
  computeCampaignDecision,
  computeAccountHealth,
  generateRecommendations,
  getCampaignTypeLabel,
  type CampaignDecisionResult,
  type CampaignType,
  type AccountHealthResult,
  type Recommendation,
} from "@/domains/meta-insights/decision-engine"
import { getClientCampaignsAction } from "@/domains/meta-insights/actions"
import { CampaignLinkButton } from "./CampaignLinkButton"

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  clientId: string
  orgId: string
  days: number
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtCurrency(amount: number, currency: string | null): string {
  if (currency) {
    try {
      return new Intl.NumberFormat("es", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount)
    } catch {
      // fallback
    }
  }
  return `$${amount.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtNum(n: number): string {
  return n.toLocaleString("es")
}

function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`
}

// ─── Day Filter ───────────────────────────────────────────────────────────────

function DayFilter({
  clientId,
  days,
}: {
  clientId: string
  days: number
}) {
  const options = [7, 30, 90]
  return (
    <div className="flex gap-1 rounded-md border border-ops-line bg-ops-s1 p-0.5">
      {options.map((d) => {
        const p = new URLSearchParams({ tab: "insights", clientId, days: String(d) })
        return (
          <Link
            key={d}
            href={`/dashboard/performance?${p}`}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              days === d
                ? "bg-ops-sel text-ops-tx"
                : "text-ops-tx3 hover:text-ops-tx2"
            }`}
          >
            {d}d
          </Link>
        )
      })}
    </div>
  )
}

// ─── Health Score Card ────────────────────────────────────────────────────────

function HealthScoreCard({ health }: { health: AccountHealthResult }) {
  const colorClass =
    health.color === "green"
      ? "text-ops-green border-ops-green"
      : health.color === "blue"
      ? "text-ops-blue border-ops-blue"
      : health.color === "amber"
      ? "text-ops-amber border-ops-amber"
      : "text-ops-coral border-ops-coral"

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-ops-line bg-ops-s1 p-6 gap-2">
      <p className="text-xs font-medium text-ops-tx3 uppercase tracking-wide">Salud de la cuenta</p>
      <div
        className={`flex h-20 w-20 items-center justify-center rounded-full border-4 ${colorClass}`}
      >
        <span className={`text-3xl font-bold tabular-nums ${colorClass.split(" ")[0]}`}>
          {health.grade}
        </span>
      </div>
      <p className={`text-lg font-semibold ${colorClass.split(" ")[0]}`}>{health.label}</p>
      <p className="text-xs text-ops-tx3">{health.score}/100 pts</p>
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  trend?: number | null // positive = up, negative = down
}

function KpiCard({ label, value, sub, trend }: KpiCardProps) {
  const trendColor =
    trend === null || trend === undefined
      ? ""
      : trend > 0
      ? "text-ops-green"
      : trend < 0
      ? "text-ops-coral"
      : "text-ops-tx3"
  const trendArrow =
    trend === null || trend === undefined
      ? null
      : trend > 0
      ? "▲"
      : trend < 0
      ? "▼"
      : null

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-ops-line bg-ops-s1 p-4">
      <p className="text-xs font-medium text-ops-tx3">{label}</p>
      <p className="font-plex text-2xl font-medium tabular-nums text-ops-tx leading-tight">
        {value}
      </p>
      {(sub !== undefined || trend !== undefined) && (
        <p className={`text-xs ${trendColor || "text-ops-tx3"}`}>
          {trendArrow && <span className="mr-0.5">{trendArrow}</span>}
          {sub}
        </p>
      )}
    </div>
  )
}

// ─── Recommendations Panel ────────────────────────────────────────────────────

function RecommendationsPanel({ recs }: { recs: Recommendation[] }) {
  if (recs.length === 0) return null

  const borderColor: Record<Recommendation["severity"], string> = {
    critical: "border-l-ops-coral",
    warning: "border-l-ops-amber",
    positive: "border-l-ops-green",
    info: "border-l-ops-blue",
  }
  const bgColor: Record<Recommendation["severity"], string> = {
    critical: "bg-ops-s2",
    warning: "bg-ops-s2",
    positive: "bg-ops-s2",
    info: "bg-ops-s2",
  }
  const tagColor: Record<Recommendation["severity"], string> = {
    critical: "bg-ops-coral/10 text-ops-coral",
    warning: "bg-ops-amber/10 text-ops-amber",
    positive: "bg-ops-green/10 text-ops-green",
    info: "bg-ops-blue/10 text-ops-blue",
  }

  return (
    <div className="rounded-lg border border-ops-line bg-ops-s1 p-4 space-y-2">
      <p className="text-sm font-semibold text-ops-tx">Recomendaciones</p>
      <div className="space-y-2">
        {recs.map((rec) => (
          <div
            key={rec.id}
            className={`flex items-start gap-3 rounded border-l-4 ${borderColor[rec.severity]} ${bgColor[rec.severity]} px-4 py-3`}
          >
            <span className="text-lg leading-none mt-0.5">{rec.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ops-tx">{rec.title}</p>
              <p className="text-xs text-ops-tx3 mt-0.5">{rec.detail}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tagColor[rec.severity]}`}
            >
              {rec.action}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Campaign Type Badge ──────────────────────────────────────────────────────

function CampaignTypeBadge({ type }: { type: CampaignType }) {
  const map: Record<CampaignType, string> = {
    leads: "bg-ops-blue/10 text-ops-blue",
    sales: "bg-ops-green/10 text-ops-green",
    traffic: "bg-ops-amber/10 text-ops-amber",
    awareness: "bg-ops-s2 text-ops-tx3",
    engagement: "bg-ops-s2 text-ops-tx3",
    unknown: "bg-ops-s2 text-ops-tx3",
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${map[type]}`}>
      {getCampaignTypeLabel(type)}
    </span>
  )
}

// ─── Campaign Decision Badge ──────────────────────────────────────────────────

function DecisionBadge({ decision }: { decision: CampaignDecisionResult["decision"] }) {
  const map: Record<
    CampaignDecisionResult["decision"],
    { label: string; className: string }
  > = {
    pause: { label: "Pausar", className: "bg-ops-coral/10 text-ops-coral border border-ops-coral/20" },
    scale: { label: "Escalar", className: "bg-ops-green/10 text-ops-green border border-ops-green/20" },
    optimize: { label: "Optimizar", className: "bg-ops-amber/10 text-ops-amber border border-ops-amber/20" },
    healthy: { label: "Saludable", className: "bg-ops-s2 text-ops-tx2 border border-ops-line" },
    insufficient_data: { label: "Pocos datos", className: "bg-ops-s2 text-ops-tx3 border border-ops-line" },
  }
  const { label, className } = map[decision]
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>
  )
}

// ─── Score Bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-ops-green" : score >= 40 ? "bg-ops-amber" : "bg-ops-coral"
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-ops-s2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-ops-tx3">{score}</span>
    </div>
  )
}

// ─── Campaign Decision Table ──────────────────────────────────────────────────

function CampaignDecisionTable({
  decisions,
  rows,
  clientId,
  internalCampaigns,
  metaToInternalMap,
}: {
  decisions: CampaignDecisionResult[]
  rows: CampaignMetricsRow[]
  clientId: string
  internalCampaigns: { id: string; name: string }[]
  metaToInternalMap: Map<string, string>
}) {
  const rowMap = new Map(rows.map((r) => [r.metaCampaignId, r]))

  return (
    <div className="rounded-lg border border-ops-line bg-ops-s1 overflow-hidden">
      <div className="border-b border-ops-line px-4 py-3">
        <p className="text-sm font-semibold text-ops-tx">Decisiones por campaña</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ops-line text-xs text-ops-tx3">
              <th className="px-4 py-2 text-left font-medium">Campaña</th>
              <th className="px-4 py-2 text-right font-medium">Gasto</th>
              <th className="px-4 py-2 text-right font-medium">Impr.</th>
              <th className="px-4 py-2 text-right font-medium">CTR</th>
              <th className="px-4 py-2 text-right font-medium">Leads</th>
              <th className="px-4 py-2 text-right font-medium">Checkouts</th>
              <th className="px-4 py-2 text-right font-medium">Ventas</th>
              <th className="px-4 py-2 text-right font-medium">Tendencia</th>
              <th className="px-4 py-2 text-center font-medium">Decisión</th>
              <th className="px-4 py-2 text-left font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {decisions.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-xs text-ops-tx3">
                  Sin datos de campañas para el período seleccionado
                </td>
              </tr>
            )}
            {decisions.map((d) => {
              const row = rowMap.get(d.metaCampaignId)
              if (!row) return null
              const spendUp = row.spendDelta > 0
              const ctrUp = row.ctrDelta > 0
              return (
                <tr
                  key={d.metaCampaignId}
                  className="border-b border-ops-line last:border-0 hover:bg-ops-hover transition-colors"
                >
                  <td className="px-4 py-3 max-w-[220px]">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <CampaignTypeBadge type={d.campaignType} />
                    </div>
                    <p className="truncate font-medium text-ops-tx text-xs" title={d.name ?? d.metaCampaignId}>
                      {d.name ?? d.metaCampaignId}
                    </p>
                    {row.daysSinceActivity > 7 && (
                      <p className="text-ops-tx3 text-xs mt-0.5">
                        Último dato: hace {row.daysSinceActivity}d
                      </p>
                    )}
                    <CampaignLinkButton
                      clientId={clientId}
                      metaCampaignId={d.metaCampaignId}
                      metaCampaignName={d.name ?? d.metaCampaignId}
                      currentInternalId={metaToInternalMap.get(d.metaCampaignId) ?? null}
                      internalCampaigns={internalCampaigns}
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-ops-tx">
                    {fmtCurrency(row.spend, row.currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-ops-tx2">
                    {fmtNum(row.impressions)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-ops-tx">
                    {fmtPct(row.ctr)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={row.totalLeads > 0 ? "text-ops-blue font-medium" : "text-ops-tx3"}>
                        {fmtNum(row.totalLeads)}
                      </span>
                      {row.costPerLead !== null && (
                        <span className="text-ops-tx3" style={{ fontSize: "10px" }}>
                          CPL${row.costPerLead.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${
                      row.conversionsCount > 0 && row.realSales === 0
                        ? "text-ops-amber"
                        : "text-ops-tx2"
                    }`}
                    title={
                      row.conversionsCount > 0 && row.realSales === 0
                        ? "Checkouts iniciados sin ventas confirmadas"
                        : undefined
                    }
                  >
                    {fmtNum(row.conversionsCount)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums">
                    <div className="flex flex-col items-end gap-0.5">
                      <span
                        className={
                          row.realSales > 0 ? "text-ops-green font-medium" : "text-ops-tx3"
                        }
                      >
                        {fmtNum(row.realSales)}
                      </span>
                      {row.costPerSale !== null && (
                        <span className="text-ops-tx3" style={{ fontSize: "10px" }}>
                          CP${row.costPerSale.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 text-xs">
                      <span className={spendUp ? "text-ops-green" : "text-ops-coral"}>
                        {spendUp ? "▲" : "▼"} ${Math.abs(row.spendDelta).toFixed(0)}%
                      </span>
                      <span className={ctrUp ? "text-ops-green" : "text-ops-coral"}>
                        CTR {ctrUp ? "▲" : "▼"} {Math.abs(row.ctrDelta).toFixed(2)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <DecisionBadge decision={d.decision} />
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBar score={d.score} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Ad Performance Table ─────────────────────────────────────────────────────

function AdPerformanceTable({ ads }: { ads: AdMetricsRow[] }) {
  const top10 = ads.slice(0, 10)
  if (top10.length === 0) return null

  const maxCtr = Math.max(...top10.map((a) => a.ctr))
  const minCtr = Math.min(...top10.map((a) => a.ctr))

  return (
    <div className="rounded-lg border border-ops-line bg-ops-s1 overflow-hidden">
      <div className="border-b border-ops-line px-4 py-3">
        <p className="text-sm font-semibold text-ops-tx">Rendimiento de anuncios</p>
        <p className="text-xs text-ops-tx3 mt-0.5">Top 10 por gasto</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ops-line text-xs text-ops-tx3">
              <th className="px-4 py-2 text-left font-medium">Anuncio</th>
              <th className="px-4 py-2 text-left font-medium">Campaña</th>
              <th className="px-4 py-2 text-right font-medium">Gasto</th>
              <th className="px-4 py-2 text-right font-medium">Impr.</th>
              <th className="px-4 py-2 text-right font-medium">CTR</th>
            </tr>
          </thead>
          <tbody>
            {top10.map((ad) => {
              const isBestCtr = ad.ctr === maxCtr && maxCtr > 0
              const isWorstCtr = ad.ctr === minCtr && top10.length > 1 && minCtr < maxCtr
              return (
                <tr
                  key={ad.metaAdId}
                  className="border-b border-ops-line last:border-0 hover:bg-ops-hover transition-colors"
                >
                  <td className="px-4 py-3 max-w-[160px]">
                    <p className="truncate text-xs text-ops-tx">{ad.name ?? ad.metaAdId}</p>
                  </td>
                  <td className="px-4 py-3 max-w-[120px]">
                    <p className="truncate text-xs text-ops-tx3">{ad.campaignName ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-ops-tx">
                    {fmtCurrency(ad.spend, ad.currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-ops-tx2">
                    {fmtNum(ad.impressions)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${
                      isBestCtr
                        ? "text-ops-green"
                        : isWorstCtr
                        ? "text-ops-coral"
                        : "text-ops-tx"
                    }`}
                  >
                    {fmtPct(ad.ctr)}
                    {isBestCtr && <span className="ml-1 text-ops-green">★</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Lead Quality Panel ───────────────────────────────────────────────────────

function LeadQualityPanel({ leadsData }: { leadsData: LeadCampaignRow[] }) {
  const withLeads = leadsData.filter((l) => l.totalLeads > 0)
  if (withLeads.length === 0) {
    return (
      <div className="rounded-lg border border-ops-line bg-ops-s1 p-6 flex flex-col items-center justify-center gap-2">
        <p className="text-sm font-medium text-ops-tx">Calidad de leads por campaña</p>
        <p className="text-xs text-ops-tx3">Sin datos de leads en los últimos 90 días</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-ops-line bg-ops-s1 overflow-hidden">
      <div className="border-b border-ops-line px-4 py-3">
        <p className="text-sm font-semibold text-ops-tx">Calidad de leads por campaña</p>
        <p className="text-xs text-ops-tx3 mt-0.5">Últimos 90 días</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ops-line text-xs text-ops-tx3">
              <th className="px-4 py-2 text-left font-medium">Campaña SyncLead</th>
              <th className="px-4 py-2 text-right font-medium">Leads</th>
              <th className="px-4 py-2 text-right font-medium">🔥 Hot</th>
              <th className="px-4 py-2 text-right font-medium">🌡 Warm</th>
              <th className="px-4 py-2 text-right font-medium">❄ Cold</th>
              <th className="px-4 py-2 text-right font-medium">Ventas</th>
              <th className="px-4 py-2 text-right font-medium">Ingresos</th>
              <th className="px-4 py-2 text-right font-medium">Conv%</th>
            </tr>
          </thead>
          <tbody>
            {withLeads.map((lc) => (
              <tr
                key={lc.campaignId}
                className="border-b border-ops-line last:border-0 hover:bg-ops-hover transition-colors"
              >
                <td className="px-4 py-3 max-w-[160px]">
                  <p className="truncate text-xs font-medium text-ops-tx">{lc.campaignName}</p>
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-ops-tx">
                  {fmtNum(lc.totalLeads)}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-ops-coral font-medium">
                  {fmtNum(lc.hotLeads)}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-ops-amber">
                  {fmtNum(lc.warmLeads)}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-ops-tx3">
                  {fmtNum(lc.coldLeads)}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-ops-tx">
                  {fmtNum(lc.totalSales)}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-ops-tx">
                  {lc.totalRevenue > 0
                    ? fmtCurrency(lc.totalRevenue, lc.revenueCurrency)
                    : "—"}
                </td>
                <td
                  className={`px-4 py-3 text-right text-xs tabular-nums font-medium ${
                    lc.conversionRate >= 10
                      ? "text-ops-green"
                      : lc.conversionRate >= 3
                      ? "text-ops-amber"
                      : "text-ops-tx3"
                  }`}
                >
                  {fmtPct(lc.conversionRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Sync Info Footer ─────────────────────────────────────────────────────────

function SyncInfoFooter({
  syncInfo,
}: {
  syncInfo: { lastSync: Date | null; recordsSynced: number; status: string } | null
}) {
  if (!syncInfo) {
    return (
      <p className="text-xs text-ops-tx3 text-center">
        Sin historial de sincronización
      </p>
    )
  }

  const lastSyncStr = syncInfo.lastSync
    ? new Intl.DateTimeFormat("es", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(syncInfo.lastSync)
    : "—"

  const statusColor =
    syncInfo.status === "completed" ? "text-ops-green" : "text-ops-coral"

  return (
    <p className="text-xs text-ops-tx3 text-center">
      Último sync:{" "}
      <span className={`font-medium ${statusColor}`}>{syncInfo.status}</span>
      {" · "}
      {lastSyncStr}
      {" · "}
      {fmtNum(syncInfo.recordsSynced)} registros
    </p>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export async function InsightsDecisionCenter({ clientId, orgId, days }: Props) {
  // 1. Check active connection
  let connection: Awaited<ReturnType<typeof getActiveInsightsConnection>> = null
  try {
    connection = await getActiveInsightsConnection(orgId, clientId)
  } catch (e) {
    console.error("[InsightsDecisionCenter] getActiveInsightsConnection:", e)
  }

  if (!connection) {
    return (
      <div className="rounded-lg border border-ops-line bg-ops-s1 px-6 py-16 text-center space-y-3">
        <p className="text-sm font-medium text-ops-tx">No hay conexión de Meta Ads activa</p>
        <p className="text-xs text-ops-tx3">
          Ve a Configuración del cliente → Meta Ads Insights y conecta una cuenta publicitaria con acceso activo.
        </p>
        <Link
          href={`/dashboard/clients/${clientId}?tab=configuracion`}
          className="inline-block mt-2 rounded-md bg-ops-sel px-4 py-2 text-xs font-medium text-ops-tx hover:bg-ops-hover transition-colors"
        >
          Ir a configuración del cliente
        </Link>
      </div>
    )
  }

  const { adAccountId } = connection

  // 2. Fetch all data in parallel — individual failures don't crash the panel
  const [campaignMetrics, accountMetrics, adMetrics, leadsData, syncInfo, internalCampaigns] =
    await Promise.allSettled([
      getCampaignMetrics(orgId, clientId, adAccountId, days),
      getAccountMetrics(orgId, clientId, adAccountId, days),
      getAdMetrics(orgId, clientId, adAccountId, days),
      getLeadCampaignData(orgId, clientId, days),
      getLastSyncInfo(orgId, adAccountId),
      getClientCampaignsAction(clientId),
    ]).then(([cm, am, adm, ld, si, ic]) => [
      cm.status === "fulfilled" ? cm.value : [],
      am.status === "fulfilled" ? am.value : {
        totalSpend: 0, totalImpressions: 0, totalClicks: 0,
        totalConversions: 0, currency: null, ctr: 0, activeCampaigns: 0,
        currentMonthSpend: 0, projectedMonthSpend: 0, daysElapsed: 1, daysInMonth: 30,
      },
      adm.status === "fulfilled" ? adm.value : [],
      ld.status === "fulfilled" ? ld.value : [],
      si.status === "fulfilled" ? si.value : null,
      ic.status === "fulfilled" ? ic.value : [],
    ] as const)

  // 3. Compute decisions
  const avgCpl =
    accountMetrics.totalConversions > 0
      ? accountMetrics.totalSpend / accountMetrics.totalConversions
      : null

  const campaignDecisions = campaignMetrics.map((row) =>
    computeCampaignDecision(row, avgCpl)
  )
  const accountHealth = computeAccountHealth(accountMetrics, campaignMetrics)
  const recommendations = generateRecommendations(
    campaignDecisions,
    accountMetrics,
    campaignMetrics,
    leadsData
  )

  // Map: metaCampaignId → internalCampaignId (for link button)
  const metaToInternalMap = new Map<string, string>(
    campaignMetrics
      .filter((r) => r.internalCampaignId !== null)
      .map((r) => [r.metaCampaignId, r.internalCampaignId!])
  )

  const hasData = accountMetrics.totalSpend > 0 || campaignMetrics.length > 0

  // 4. Render
  return (
    <div className="space-y-4">
      {/* Header row: account + day filter */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-ops-tx3">
          Cuenta: <span className="font-medium text-ops-tx">{adAccountId}</span>
        </p>
        <DayFilter clientId={clientId} days={days} />
      </div>

      {/* No data yet — guide the user to sync */}
      {!hasData && (
        <div className="rounded-lg border border-ops-amber/30 bg-ops-amber/5 px-5 py-4 flex items-start gap-3">
          <span className="text-base leading-none mt-0.5">⚡</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-ops-tx">
              Sin datos para este período
            </p>
            <p className="text-xs text-ops-tx3 mt-1">
              Ve a <strong>Configuración del cliente → Meta Ads Insights</strong>, selecciona la conexión y presiona <strong>Sync</strong> para importar datos desde Meta.
            </p>
          </div>
          <Link
            href={`/dashboard/clients/${clientId}?tab=configuracion`}
            className="shrink-0 rounded-md border border-ops-amber/40 px-3 py-1.5 text-xs font-medium text-ops-amber hover:bg-ops-amber/10 transition-colors"
          >
            Ir a Configuración
          </Link>
        </div>
      )}

      {/* Top row: Health + KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <HealthScoreCard health={accountHealth} />
        <KpiCard
          label="Gasto total"
          value={fmtCurrency(accountMetrics.totalSpend, accountMetrics.currency)}
          sub={`${days}d`}
        />
        <KpiCard
          label="Impresiones"
          value={fmtNum(accountMetrics.totalImpressions)}
          sub={`${days}d`}
        />
        <KpiCard
          label="Clics"
          value={fmtNum(accountMetrics.totalClicks)}
          sub={`${days}d`}
        />
        <KpiCard
          label="CTR promedio"
          value={fmtPct(accountMetrics.ctr)}
          sub={`${days}d`}
        />
        <KpiCard
          label="Proyección mensual"
          value={fmtCurrency(accountMetrics.projectedMonthSpend, accountMetrics.currency)}
          sub={`Día ${accountMetrics.daysElapsed}/${accountMetrics.daysInMonth}`}
          trend={
            accountMetrics.projectedMonthSpend > accountMetrics.currentMonthSpend * 1.1
              ? 1
              : accountMetrics.projectedMonthSpend < accountMetrics.currentMonthSpend * 0.9
              ? -1
              : 0
          }
        />
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <RecommendationsPanel recs={recommendations} />
      )}

      {/* Campaign Decision Table */}
      <CampaignDecisionTable
        decisions={campaignDecisions}
        rows={campaignMetrics}
        clientId={clientId}
        internalCampaigns={internalCampaigns}
        metaToInternalMap={metaToInternalMap}
      />

      {/* Bottom row: Ads + Leads */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AdPerformanceTable ads={adMetrics} />
        <LeadQualityPanel leadsData={leadsData} />
      </div>

      {/* Sync footer */}
      <SyncInfoFooter syncInfo={syncInfo} />
    </div>
  )
}

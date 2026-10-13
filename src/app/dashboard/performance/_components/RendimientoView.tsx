"use client"

import { useState, useMemo } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts"
import Link from "next/link"
import type { PerformanceRow } from "@/domains/analytics/types"
import type { MetaSpendSummary, LeadsByDayRow } from "@/domains/analytics/repository"

// ─── Design tokens (hex values for Recharts SVG) ──────────────────────────────
const BLUE   = "#3E5CFA"
const GREEN  = "#12B48A"
const AMBER  = "#F59E0B"
const CORAL  = "#F0684D"

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtBig(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString("es")
}

function fmtMoney(n: number, currency?: string | null): string {
  const sym = currency ?? "USD"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ${sym}`
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}k ${sym}`
  return n.toLocaleString("es", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " " + sym
}

function fmtDay(day: string): string {
  const d = new Date(day + "T00:00:00")
  return d.toLocaleDateString("es", { day: "numeric", month: "short" })
}

function deltaText(pct: number): string {
  return `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}%`
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  rows: PerformanceRow[]
  prevRows: PerformanceRow[]
  timeSeries: LeadsByDayRow[]
  metaSpend?: MetaSpendSummary | null
}

interface CampaignAgg {
  id: string
  name: string
  leads: number
  sales: number
  revenue: number
  spend: number | null
  currency: string | null
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-ops-line bg-ops-bg shadow-ops-card px-3 py-2.5 text-xs">
      <p className="font-medium text-ops-tx2 mb-1.5">{label ? fmtDay(label) : ""}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 leading-5">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-ops-tx3">{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-ops-tx">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── KPI Hero Card ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, delta, accent = "blue",
}: {
  label: string
  value: string
  delta?: number | null
  accent?: "blue" | "green" | "amber" | "coral"
}) {
  const accentMap = {
    blue:  { line: "bg-ops-blue",  text: "text-ops-blue"  },
    green: { line: "bg-ops-green", text: "text-ops-green" },
    amber: { line: "bg-ops-amber", text: "text-ops-amber" },
    coral: { line: "bg-ops-coral", text: "text-ops-coral" },
  }
  const { line, text } = accentMap[accent]

  const deltaPositive = delta !== null && delta !== undefined && delta > 0
  const deltaNegative = delta !== null && delta !== undefined && delta < 0

  return (
    <div className="relative rounded-[20px] border border-ops-line bg-ops-s1 p-5 shadow-ops-card overflow-hidden">
      {/* accent bar */}
      <span className={`absolute inset-x-0 top-0 h-[3px] ${line} opacity-70 rounded-t-[20px]`} />
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ops-tx3 mt-1">{label}</p>
      <p className="mt-2.5 text-[32px] font-extrabold leading-none tabular-nums text-ops-tx tracking-tight">
        {value}
      </p>
      {delta !== null && delta !== undefined ? (
        <p className={`mt-2 text-[11px] font-medium ${deltaPositive ? "text-ops-green" : deltaNegative ? "text-ops-coral" : "text-ops-tx3"}`}>
          {deltaText(delta)} vs período ant.
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-ops-tx3">— sin comparativa</p>
      )}
    </div>
  )
}

// ─── Meta Ads Strip ───────────────────────────────────────────────────────────

function roasStatus(roas: number | null) {
  if (roas === null) return { label: "—", color: "text-ops-tx3" }
  if (roas >= 2)     return { label: "excelente", color: "text-ops-green" }
  if (roas >= 1)     return { label: "positivo",  color: "text-ops-amber" }
  return               { label: "negativo",   color: "text-ops-coral"  }
}

function MetaStrip({ spend, cpl, cpa, roas, currency }: {
  spend: number
  cpl: number | null
  cpa: number | null
  roas: number | null
  currency?: string | null
}) {
  const rs = roasStatus(roas)
  return (
    <div className="rounded-[20px] border border-ops-blue/20 bg-ops-blue-bg px-5 py-4 shadow-ops-card">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-ops-blue" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-ops-blue">Meta Ads</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Gasto", value: fmtMoney(spend, currency), sub: "inversión total" },
          { label: "CPL", value: cpl !== null ? fmtMoney(cpl, currency) : "—", sub: "por lead" },
          { label: "CPA", value: cpa !== null ? fmtMoney(cpa, currency) : "—", sub: "por venta" },
          { label: "ROAS", value: roas !== null ? `${roas.toFixed(2)}x` : "—", sub: rs.label, valueClass: rs.color },
        ].map((m) => (
          <div key={m.label}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ops-tx3">{m.label}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums leading-tight ${m.valueClass ?? "text-ops-tx"}`}>{m.value}</p>
            <p className="text-[10px] text-ops-tx3 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Campaign row ─────────────────────────────────────────────────────────────

function CampaignRow({ camp, maxLeads }: { camp: CampaignAgg; maxLeads: number }) {
  const conv  = camp.leads > 0 ? (camp.sales / camp.leads) * 100 : null
  const roas  = camp.spend && camp.spend > 0 && camp.revenue > 0 ? camp.revenue / camp.spend : null
  const pct   = maxLeads > 0 ? (camp.leads / maxLeads) * 100 : 0

  return (
    <Link
      href={`/dashboard/campaigns/${camp.id}/leads`}
      className="group block rounded-xl border border-ops-line bg-ops-s1 px-4 py-3.5 hover:border-ops-blue/30 hover:bg-ops-s2 transition-all duration-150"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-[13px] font-semibold text-ops-tx truncate flex-1 group-hover:text-ops-blue transition-colors">
          {camp.name}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {conv !== null && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              conv >= 10 ? "bg-ops-green-bg text-ops-green" :
              conv >= 5  ? "bg-ops-amber-bg text-ops-amber" :
                           "bg-ops-blue-bg text-ops-blue"
            }`}>
              {conv.toFixed(1)}% conv
            </span>
          )}
          {roas !== null && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              roas >= 2 ? "bg-ops-green-bg text-ops-green" :
              roas >= 1 ? "bg-ops-amber-bg text-ops-amber" :
                          "bg-ops-coral-bg text-ops-coral"
            }`}>
              {roas.toFixed(1)}x
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-1.5 rounded-full bg-ops-s3 overflow-hidden mb-3">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-ops-blue transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-[11px] tabular-nums">
        <span className="font-bold text-ops-tx">{fmtBig(camp.leads)} <span className="font-normal text-ops-tx3">leads</span></span>
        <span className="text-ops-tx3">·</span>
        <span className={`font-bold ${camp.sales > 0 ? "text-ops-green" : "text-ops-tx3"}`}>
          {fmtBig(camp.sales)} <span className="font-normal text-ops-tx3">ventas</span>
        </span>
        {camp.revenue > 0 && (
          <>
            <span className="text-ops-tx3">·</span>
            <span className="font-bold text-ops-tx">{fmtMoney(camp.revenue, camp.currency)}</span>
          </>
        )}
        <span className="ml-auto text-ops-tx3 text-[10px] group-hover:text-ops-blue transition-colors">Ver leads →</span>
      </div>
    </Link>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type ChartMode  = "ambos"   | "leads" | "ventas"
type SortMode   = "leads"   | "revenue" | "roas"

export function RendimientoView({ rows, prevRows, timeSeries, metaSpend }: Props) {
  const [chartMode, setChartMode] = useState<ChartMode>("ambos")
  const [sortMode,  setSortMode]  = useState<SortMode>("leads")

  // ── Aggregate totals ────────────────────────────────────────────────────────
  const leads   = rows.reduce((s, r) => s + r.totalLeads,   0)
  const sales   = rows.reduce((s, r) => s + r.totalSales,   0)
  const revenue = rows.reduce((s, r) => s + r.totalRevenue, 0)
  const conv: number | null = leads > 0 ? (sales / leads) * 100 : null

  const prevLeads   = prevRows.reduce((s, r) => s + r.totalLeads,   0)
  const prevSales   = prevRows.reduce((s, r) => s + r.totalSales,   0)
  const prevRevenue = prevRows.reduce((s, r) => s + r.totalRevenue, 0)

  const deltaLeads   = prevLeads   > 0 ? ((leads   - prevLeads)   / prevLeads)   * 100 : null
  const deltaSales   = prevSales   > 0 ? ((sales   - prevSales)   / prevSales)   * 100 : null
  const deltaRevenue = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null

  const spend = metaSpend?.totalSpend ?? 0
  const currency = metaSpend?.currency
  const hasMetaData = !!metaSpend && spend > 0
  const cpl   = hasMetaData && leads   > 0 ? spend / leads   : null
  const cpa   = hasMetaData && sales   > 0 ? spend / sales   : null
  const roas  = hasMetaData && revenue > 0 ? revenue / spend : null

  // ── Aggregate campaigns ─────────────────────────────────────────────────────
  const campaigns: CampaignAgg[] = useMemo(() => {
    const map = new Map<string, CampaignAgg>()
    for (const r of rows) {
      const ex = map.get(r.campaignId)
      if (ex) {
        ex.leads   += r.totalLeads
        ex.sales   += r.totalSales
        ex.revenue += r.totalRevenue
        if (r.spend !== null) ex.spend = (ex.spend ?? 0) + r.spend
        ex.currency = r.currency ?? ex.currency
      } else {
        map.set(r.campaignId, {
          id: r.campaignId, name: r.campaignName,
          leads: r.totalLeads, sales: r.totalSales, revenue: r.totalRevenue,
          spend: r.spend, currency: r.currency,
        })
      }
    }
    return Array.from(map.values())
  }, [rows])

  const sortedCampaigns = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      if (sortMode === "revenue") return b.revenue - a.revenue
      if (sortMode === "roas") {
        const ra = a.spend && a.revenue > 0 ? a.revenue / a.spend : 0
        const rb = b.spend && b.revenue > 0 ? b.revenue / b.spend : 0
        return rb - ra
      }
      return b.leads - a.leads
    })
  }, [campaigns, sortMode])

  const maxLeads = Math.max(...campaigns.map((c) => c.leads), 1)

  // ── Chart: fill missing days with 0 ────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!timeSeries.length) return []
    return timeSeries.map((d) => ({
      ...d,
      displayDay: fmtDay(d.day),
    }))
  }, [timeSeries])

  const noData = leads === 0 && sales === 0

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Leads captados"  value={fmtBig(leads)}  delta={deltaLeads}   accent="blue"  />
        <KpiCard label="Ventas cerradas" value={fmtBig(sales)}  delta={deltaSales}   accent="green" />
        <KpiCard
          label="Conversión"
          value={conv !== null ? `${conv.toFixed(1)}%` : "—"}
          accent={conv !== null && conv >= 10 ? "green" : conv !== null && conv >= 5 ? "amber" : "blue"}
        />
        <KpiCard
          label="Ingresos"
          value={revenue > 0 ? fmtMoney(revenue, currency) : "—"}
          delta={revenue > 0 ? deltaRevenue : null}
          accent="green"
        />
      </div>

      {/* ── Meta Ads Strip ────────────────────────────────────────────────── */}
      {hasMetaData && (
        <MetaStrip spend={spend} cpl={cpl} cpa={cpa} roas={roas} currency={currency} />
      )}

      {/* ── Chart ─────────────────────────────────────────────────────────── */}
      {chartData.length > 1 && (
        <div className="rounded-[20px] border border-ops-line bg-ops-s1 p-5 shadow-ops-card">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <p className="text-sm font-semibold text-ops-tx">Tendencia del período</p>
              <p className="text-xs text-ops-tx3 mt-0.5">Evolución diaria</p>
            </div>
            <div className="flex rounded-lg bg-ops-s2 p-0.5 gap-px">
              {(["ambos", "leads", "ventas"] as ChartMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setChartMode(m)}
                  className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all capitalize ${
                    chartMode === m
                      ? "bg-ops-bg text-ops-tx shadow-sm"
                      : "text-ops-tx3 hover:text-ops-tx2"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-4 mb-3">
            {(chartMode === "leads" || chartMode === "ambos") && (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-full" style={{ backgroundColor: BLUE }} />
                <span className="text-[10px] text-ops-tx3 font-medium">Leads</span>
              </div>
            )}
            {(chartMode === "ventas" || chartMode === "ambos") && (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-full" style={{ backgroundColor: GREEN }} />
                <span className="text-[10px] text-ops-tx3 font-medium">Ventas</span>
              </div>
            )}
          </div>

          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={BLUE}  stopOpacity={0.18} />
                    <stop offset="100%" stopColor={BLUE}  stopOpacity={0}    />
                  </linearGradient>
                  <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={GREEN} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={GREEN} stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--ops-line)"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  tickFormatter={fmtDay}
                  tick={{ fontSize: 10, fill: "var(--ops-tx3)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "var(--ops-tx3)" }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ stroke: "var(--ops-line)", strokeWidth: 1 }}
                />
                {(chartMode === "leads" || chartMode === "ambos") && (
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Leads"
                    stroke={BLUE}
                    strokeWidth={2.5}
                    fill="url(#gradLeads)"
                    dot={false}
                    activeDot={{ r: 4, fill: BLUE, stroke: "white", strokeWidth: 2 }}
                  />
                )}
                {(chartMode === "ventas" || chartMode === "ambos") && (
                  <Area
                    type="monotone"
                    dataKey="converted"
                    name="Ventas"
                    stroke={GREEN}
                    strokeWidth={2.5}
                    fill="url(#gradVentas)"
                    dot={false}
                    activeDot={{ r: 4, fill: GREEN, stroke: "white", strokeWidth: 2 }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Campaigns ─────────────────────────────────────────────────────── */}
      <div className="rounded-[20px] border border-ops-line bg-ops-s1 p-5 shadow-ops-card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-semibold text-ops-tx">Campañas</p>
            <p className="text-xs text-ops-tx3 mt-0.5">
              {campaigns.length} {campaigns.length === 1 ? "campaña" : "campañas"} en el período
            </p>
          </div>
          {campaigns.length > 1 && (
            <div className="flex rounded-lg bg-ops-s2 p-0.5 gap-px">
              {(["leads", "revenue", "roas"] as SortMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setSortMode(m)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    sortMode === m
                      ? "bg-ops-bg text-ops-tx shadow-sm"
                      : "text-ops-tx3 hover:text-ops-tx2"
                  }`}
                >
                  {m === "leads" ? "Leads" : m === "revenue" ? "Ingresos" : "ROAS"}
                </button>
              ))}
            </div>
          )}
        </div>

        {noData ? (
          <div className="py-12 text-center">
            <p className="text-sm text-ops-tx3">Sin datos para este período</p>
            <p className="text-xs text-ops-tx3 mt-1">Ajusta el rango de fechas o el cliente seleccionado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedCampaigns.map((c) => (
              <CampaignRow key={c.id} camp={c} maxLeads={maxLeads} />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

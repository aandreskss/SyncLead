"use client"

import { useSyncExternalStore } from "react"
import {
  ComposedChart, Area, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import type {
  LeadsByDayRow,
  LeadsByCampaignRow,
  LeadsByUtmRow,
  LeadsByPlatformRow,
  LeadsByDeviceRow,
  TopCityRow,
  TempByDayRow,
} from "@/domains/analytics/repository"

// ─── Theme ───────────────────────────────────────────────────────────────────

// Paleta Signal Glass (los valores se repiten aquí porque Recharts pinta SVG con hex):
// cian = leads/atribución, menta = ventas/conversión, coral/ámbar/glacial = caliente/tibio/frío.
const C = {
  grid: "#2a3142",
  text: "#8d97ad",
  indigo: "#46cff5",
  emerald: "#57e8b0",
  red: "#ff7f6e",
  amber: "#f7be55",
  blue: "#86b6ff",
  purple: "#b79cff",
}

const PIE_COLORS = [C.indigo, C.emerald, C.amber, C.red, C.blue, C.purple, "#ffa46b", "#b8e86b"]

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tip({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="sg-glass rounded-xl border border-sg-border px-3 py-2 text-xs shadow-sg-float">
      {label && <p className="mb-1 text-sg-muted">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="flex gap-2">
          <span>{p.name}:</span>
          <span className="sg-tabular font-mono font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Axis helpers ─────────────────────────────────────────────────────────────

function fmtDay(iso: string) {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

function truncate(str: string, n = 14) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ title, children, className = "", summary }: { title: string; children: React.ReactNode; className?: string; summary?: string }) {
  return (
    <section aria-label={title} className={`rounded-2xl border border-sg-border bg-sg-s1 p-5 shadow-sg-raise ${className}`}>
      <h2 className="mb-4 text-sm font-semibold text-sg-muted">{title}</h2>
      {summary && <p className="sr-only">{summary}</p>}
      {children}
    </section>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  byDay: LeadsByDayRow[]
  byCampaign: LeadsByCampaignRow[]
  byUtm: LeadsByUtmRow[]
  byPlatform: LeadsByPlatformRow[]
  byDevice: LeadsByDeviceRow[]
  byCities: TopCityRow[]
  byTempDay: TempByDayRow[]
}

function subscribeNever() {
  return () => {}
}
function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChartsClient({ byDay, byCampaign, byUtm, byPlatform, byDevice, byCities, byTempDay }: Props) {
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false)
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  )

  const skeletonH = (h: number) => (
    <div className={`h-[${h}px] bg-zinc-800/50 rounded animate-pulse`} style={{ height: h }} />
  )

  if (!mounted) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="rounded-2xl border border-sg-border bg-sg-s1 p-5">{skeletonH(280)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-sg-border bg-sg-s1 p-5">{skeletonH(240)}</div>
          ))}
        </div>
      </div>
    )
  }

  // Pie label renderer — using any because Recharts PieLabelRenderProps uses number | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderPieLabel = (props: any) => {
    const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, name = "", percent = 0 } = props
    if (percent < 0.05) return null
    const RADIAN = Math.PI / 180
    const r = outerRadius + 20
    const x = cx + r * Math.cos(-midAngle * RADIAN)
    const y = cy + r * Math.sin(-midAngle * RADIAN)
    return (
      <text x={x} y={y} fill={C.text} fontSize={10} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central">
        {truncate(name, 12)} ({(percent * 100).toFixed(0)}%)
      </text>
    )
  }

  const hasData = (arr: unknown[]) => arr.length > 0

  return (
    <div className="space-y-4">
      {/* ── Leads por día ─────────────────────────────────────────────────── */}
      <Card title="Leads por día" summary={`Leads por día: ${byDay.reduce((a, r) => a + r.total, 0)} en total durante ${byDay.length} días.`}>
        {!hasData(byDay) ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<Tip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: C.text }} />
              <Area isAnimationActive={!reduceMotion} type="monotone" dataKey="total" name="Leads" stroke={C.indigo} fill={`${C.indigo}20`} strokeWidth={2} dot={false} />
              <Line isAnimationActive={!reduceMotion}
                type="monotone"
                dataKey="converted"
                name="Ventas"
                stroke={C.emerald}
                strokeWidth={2}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dot={(props: any) => {
                  if (!props.value) return <circle key={`dot-${props.index}`} r={0} />
                  return <circle key={`dot-${props.index}`} cx={props.cx ?? 0} cy={props.cy ?? 0} r={5} fill={C.emerald} stroke="none" />
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── Row 2: Campaña + Temperatura ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Leads por campaña">
          {!hasData(byCampaign) ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byCampaign} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis dataKey="name" tickFormatter={(v) => truncate(v, 12)} tick={{ fill: C.text, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={<Tip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: C.text }} />
                <Bar isAnimationActive={!reduceMotion} dataKey="total" name="Leads" fill={C.indigo} radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Bar isAnimationActive={!reduceMotion} dataKey="converted" name="Ventas" fill={C.emerald} radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Temperatura acumulada por día">
          {!hasData(byTempDay) ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byTempDay}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={<Tip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: C.text }} />
                <Bar isAnimationActive={!reduceMotion} dataKey="cold" name="Frío" stackId="temp" fill={C.blue} />
                <Bar isAnimationActive={!reduceMotion} dataKey="warm" name="Tibio" stackId="temp" fill={C.amber} />
                <Bar isAnimationActive={!reduceMotion} dataKey="hot" name="Caliente" stackId="temp" fill={C.red} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── Row 3: Plataforma + Dispositivo ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Distribución por plataforma">
          {!hasData(byPlatform) ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie isAnimationActive={!reduceMotion}
                  data={byPlatform}
                  dataKey="total"
                  nameKey="platform"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  labelLine={false}
                  label={renderPieLabel}
                >
                  {byPlatform.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<Tip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Distribución por dispositivo">
          {!hasData(byDevice) ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie isAnimationActive={!reduceMotion}
                  data={byDevice}
                  dataKey="total"
                  nameKey="device"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  labelLine={false}
                  label={renderPieLabel}
                >
                  {byDevice.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<Tip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── Row 4: Top anuncios + Top ciudades ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Top 10 anuncios (utm_content)">
          {!hasData(byUtm) ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={byUtm.length * 30 + 20}>
              <BarChart data={[...byUtm].reverse()} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis type="number" tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="utmContent" width={120} tick={{ fill: C.text, fontSize: 10 }} tickFormatter={(v) => truncate(v, 18)} axisLine={false} tickLine={false} />
                <Tooltip content={<Tip />} />
                <Bar isAnimationActive={!reduceMotion} dataKey="total" name="Leads" fill={C.indigo} radius={[0, 3, 3, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Top 10 ciudades">
          {!hasData(byCities) ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={byCities.length * 30 + 20}>
              <BarChart data={[...byCities].reverse()} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis type="number" tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="city" width={90} tick={{ fill: C.text, fontSize: 10 }} tickFormatter={(v) => truncate(v, 14)} axisLine={false} tickLine={false} />
                <Tooltip content={<Tip />} />
                <Bar isAnimationActive={!reduceMotion} dataKey="total" name="Leads" fill={C.purple} radius={[0, 3, 3, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="h-[200px] flex items-center justify-center text-zinc-600 text-sm">
      Sin datos para este período
    </div>
  )
}

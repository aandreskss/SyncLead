"use client"

import { useState, useEffect } from "react"
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

const C = {
  grid: "#27272a",
  text: "#71717a",
  indigo: "#818cf8",
  emerald: "#34d399",
  red: "#f87171",
  amber: "#fbbf24",
  blue: "#60a5fa",
  purple: "#c084fc",
}

const PIE_COLORS = [C.indigo, C.emerald, C.amber, C.red, C.blue, C.purple, "#fb923c", "#a3e635"]

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tip({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-zinc-400 mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="flex gap-2">
          <span>{p.name}:</span>
          <span className="font-semibold">{p.value}</span>
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

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900 p-5 ${className}`}>
      <p className="text-sm font-medium text-zinc-300 mb-4">{title}</p>
      {children}
    </div>
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

// ─── Main component ───────────────────────────────────────────────────────────

export function ChartsClient({ byDay, byCampaign, byUtm, byPlatform, byDevice, byCities, byTempDay }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const skeletonH = (h: number) => (
    <div className={`h-[${h}px] bg-zinc-800/50 rounded animate-pulse`} style={{ height: h }} />
  )

  if (!mounted) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">{skeletonH(280)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">{skeletonH(240)}</div>
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
      <Card title="Leads por día">
        {!hasData(byDay) ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<Tip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: C.text }} />
              <Area type="monotone" dataKey="total" name="Leads" stroke={C.indigo} fill={`${C.indigo}20`} strokeWidth={2} dot={false} />
              <Line
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
                <Bar dataKey="total" name="Leads" fill={C.indigo} radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Bar dataKey="converted" name="Ventas" fill={C.emerald} radius={[3, 3, 0, 0]} maxBarSize={40} />
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
                <Bar dataKey="cold" name="Frío" stackId="temp" fill={C.blue} />
                <Bar dataKey="warm" name="Tibio" stackId="temp" fill={C.amber} />
                <Bar dataKey="hot" name="Caliente" stackId="temp" fill={C.red} radius={[3, 3, 0, 0]} />
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
                <Pie
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
                <Pie
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
                <Bar dataKey="total" name="Leads" fill={C.indigo} radius={[0, 3, 3, 0]} maxBarSize={18} />
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
                <Bar dataKey="total" name="Leads" fill={C.purple} radius={[0, 3, 3, 0]} maxBarSize={18} />
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

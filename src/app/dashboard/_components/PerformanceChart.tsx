"use client"

import { useState, useSyncExternalStore } from "react"
import { Info } from "lucide-react"
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { fmtPct, tipDay } from "./format"

export interface DayPoint {
  day: string
  total: number
  converted: number
  /** Leads del periodo anterior alineados por posición (día n del periodo). */
  prevTotal?: number
}

const C = { grid: "#1e2834", text: "#7b8898", leads: "#4c7dff", sales: "#37c790", prev: "#7b8898" }

function subscribeNever() {
  return () => {}
}
function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

function fmtDay(iso: string) {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

type SeriesMode = "both" | "leads" | "sales"

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-lg border border-ops-bd bg-ops-side p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-7 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150 ${
            value === o.value ? "bg-ops-sel text-ops-tx shadow-[inset_0_-2px_0_#4c7dff]" : "text-ops-tx2 hover:bg-[#171f2b] hover:text-ops-tx"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface TipProps {
  active?: boolean
  payload?: { payload: DayPoint }[]
  compare: boolean
}

function Tip({ active, payload, compare }: TipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const conv = p.total > 0 ? fmtPct((p.converted / p.total) * 100) : "Sin leads"
  const row = (color: string | null, label: string, value: string | number) => (
    <div className="flex items-center justify-between gap-6 text-[13px] leading-[22px]">
      <span className="flex items-center gap-2 text-ops-tx2">
        {color && <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: color }} />}
        {label}
      </span>
      <span className="font-plex font-medium text-ops-tx">{value}</span>
    </div>
  )
  return (
    <div className="min-w-[190px] rounded-lg border border-ops-bd2 bg-ops-raised px-3.5 py-3">
      <p className="mb-1.5 text-xs font-semibold capitalize text-ops-tx">{tipDay(p.day)}</p>
      {row(C.leads, "Leads", p.total)}
      {row(C.sales, "Ventas", p.converted)}
      <div className="my-1.5 h-px bg-ops-bd" />
      {row(null, "Conversión", conv)}
      {compare && (
        <p className="mt-2 border-t border-ops-bd pt-2 text-xs text-ops-tx2">
          {p.prevTotal === undefined ? "Periodo anterior: sin dato" : `Periodo anterior: ${p.prevTotal} leads`}
        </p>
      )}
    </div>
  )
}

interface Props {
  days: DayPoint[]
  totalLeads: number
  totalSales: number
  hasPrev: boolean
  /** Nota contextual cuando la actividad está concentrada. */
  note?: string
}

export function PerformanceChart({ days, totalLeads, totalSales, hasPrev, note }: Props) {
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false)
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  )

  // Con actividad solo en la última semana se enfoca esa semana; el usuario puede ver el periodo completo.
  const lastActive = days.reduce((acc, d, i) => (d.total > 0 || d.converted > 0 ? i : acc), -1)
  const firstActive = days.findIndex((d) => d.total > 0 || d.converted > 0)
  const canFocus = days.length > 14 && firstActive >= days.length - 7 && lastActive >= 0
  const [range, setRange] = useState<"focus" | "full">(canFocus ? "focus" : "full")
  const [series, setSeries] = useState<SeriesMode>("both")
  const [compare, setCompare] = useState(false)

  const view = range === "focus" && canFocus ? days.slice(-7) : days
  const showLeads = series !== "sales"
  const showSales = series !== "leads"

  return (
    <section aria-label="Rendimiento del periodo" className="rounded-lg border border-ops-line bg-ops-s1 p-4 lg:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ops-tx">Rendimiento del periodo</h2>
          <p className="mt-1 text-[13px] text-ops-tx2">Leads por día y ventas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Segmented<SeriesMode>
            label="Series"
            value={series}
            onChange={setSeries}
            options={[
              { value: "both", label: "Ambos" },
              { value: "leads", label: "Leads" },
              { value: "sales", label: "Ventas" },
            ]}
          />
          {canFocus && (
            <Segmented<"focus" | "full">
              label="Rango del gráfico"
              value={range}
              onChange={setRange}
              options={[
                { value: "focus", label: "Últimos 7 días" },
                { value: "full", label: "Periodo completo" },
              ]}
            />
          )}
        </div>
      </div>

      {note && (
        <p className="mt-4 flex items-start gap-2.5 rounded-md bg-ops-bg px-3 py-2.5 text-sm leading-snug text-ops-tx">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ops-blue-t" aria-hidden="true" />
          <span>{note}</span>
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-5 text-[13px] text-ops-tx2">
          <span className="flex items-center gap-2">
            <span aria-hidden className="h-[3px] w-3.5 rounded-sm" style={{ background: C.leads }} />
            Leads <span className="font-plex font-medium text-ops-tx">{totalLeads}</span>
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden className="h-[3px] w-3.5 rounded-sm" style={{ background: C.sales }} />
            Ventas <span className="font-plex font-medium text-ops-tx">{totalSales}</span>
          </span>
        </div>
        {hasPrev && (
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ops-tx2">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="h-4 w-4 accent-ops-blue" />
            Comparar con periodo anterior
          </label>
        )}
      </div>

      <p className="sr-only">
        Leads por día: {totalLeads} en total y {totalSales} ventas durante {days.length} días.
      </p>

      <div className="mt-3 h-[260px]">
        {!mounted ? (
          <div className="h-full animate-pulse rounded bg-ops-raised/60" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={view} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={fmtDay}
                tick={{ fill: C.text, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis tick={{ fill: C.text, fontSize: 12 }} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
              <Tooltip content={<Tip compare={compare} />} cursor={{ stroke: "#3a475a", strokeDasharray: "3 3" }} />
              {compare && hasPrev && (
                <Line
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="prevTotal"
                  name="Periodo anterior"
                  stroke={C.prev}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  legendType="none"
                />
              )}
              {showLeads && (
                <Area
                  isAnimationActive={!reduceMotion}
                  type="monotone"
                  dataKey="total"
                  name="Leads"
                  stroke={C.leads}
                  fill={`${C.leads}22`}
                  strokeWidth={2}
                  dot={false}
                />
              )}
              {showSales && (
                <Line
                  isAnimationActive={!reduceMotion}
                  type="monotone"
                  dataKey="converted"
                  name="Ventas"
                  stroke={C.sales}
                  strokeWidth={2}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  dot={(props: any) => {
                    if (!props.value) return <circle key={`dot-${props.index}`} r={0} />
                    return <circle key={`dot-${props.index}`} cx={props.cx ?? 0} cy={props.cy ?? 0} r={5} fill={C.sales} stroke="none" />
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

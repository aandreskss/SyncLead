import type { ReactNode } from "react"
import { HEAT_CLS, FUNNEL, type Heat } from "./data"

export function HeatBadge({ heat }: { heat: Heat }) {
  return <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${HEAT_CLS[heat]}`}>{heat}</span>
}

export function Sample({ children = "Datos de ejemplo" }: { children?: ReactNode }) {
  return <span className="text-[11px] text-sg-subtle">{children}</span>
}

export function Kpi({ label, value, note, tone = "" }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-sg-border bg-sg-bg p-3.5">
      <p className="text-xs text-sg-subtle">{label}</p>
      <p className={`sg-tabular mt-1 font-mono text-xl font-semibold ${tone}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-sg-muted">{note}</p>}
    </div>
  )
}

export function FunnelBars() {
  const max = FUNNEL[0].n
  return (
    <ul className="space-y-2" aria-label="Funnel de ejemplo">
      {FUNNEL.map((f, i) => (
        <li key={f.name} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3 text-xs">
          <span className="text-sg-muted">{f.name}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-sg-s3">
            <span
              className={`block h-full rounded-full ${i === FUNNEL.length - 1 ? "bg-sg-green" : "bg-sg-accent"}`}
              style={{ width: `${(f.n / max) * 100}%` }}
            />
          </span>
          <span className="sg-tabular text-right font-mono text-sg-ink">{f.n}</span>
        </li>
      ))}
    </ul>
  )
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-sg-border bg-sg-s1 ${className}`}>{children}</div>
}

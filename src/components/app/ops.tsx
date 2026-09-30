import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Contenedor de página del dashboard: padding y separación estándar. */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-5 px-4 py-5 md:px-7 md:py-6", className)}>{children}</div>
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-ops-blue">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[22px] font-semibold leading-tight text-ops-tx tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-ops-tx2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/* ─── Panel ─────────────────────────────────────────────────────────────────
   variant="white"  → tarjeta blanca estándar (por defecto)
   variant="navy"   → panel oscuro de contraste para "Qué revisar"
   variant="coral"  → fondo coral suave para callouts / CTA destacados
*/
type PanelVariant = "white" | "navy" | "coral"

const PANEL_VARIANTS: Record<PanelVariant, { wrap: string; title: string; desc: string }> = {
  white: {
    wrap: "overflow-hidden rounded-[20px] border border-ops-line bg-ops-s1 shadow-ops-card",
    title: "text-sm font-semibold text-ops-tx",
    desc: "mt-0.5 text-xs text-ops-tx2",
  },
  navy: {
    wrap: "overflow-hidden rounded-[20px] border border-transparent bg-ops-navy shadow-ops-card",
    title: "text-sm font-semibold text-ops-navy-tx",
    desc: "mt-0.5 text-xs text-ops-navy-tx2",
  },
  coral: {
    wrap: "overflow-hidden rounded-[20px] border border-ops-coral/20 bg-ops-coral-bg shadow-ops-card",
    title: "text-sm font-semibold text-ops-tx",
    desc: "mt-0.5 text-xs text-ops-tx2",
  },
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  variant = "white",
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  variant?: PanelVariant
}) {
  const v = PANEL_VARIANTS[variant]
  return (
    <section className={cn(v.wrap, className)}>
      {title ? (
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <h2 className={v.title}>{title}</h2>
            {description ? <p className={v.desc}>{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

/* ─── KPICard ────────────────────────────────────────────────────────────────
   Tarjeta de métrica clave: icono pastel (40×40, radio 12px) arriba a la derecha,
   label pequeño, valor grande, píldora de delta abajo.
*/
type KPITone = "blue" | "green" | "coral" | "amber" | "navy"

const KPI_TONES: Record<KPITone, { icon: string; badge: string }> = {
  blue:  { icon: "bg-ops-blue-bg text-ops-blue",   badge: "bg-ops-blue-bg text-ops-blue" },
  green: { icon: "bg-ops-green-bg text-ops-green",  badge: "bg-ops-green-bg text-ops-green" },
  coral: { icon: "bg-ops-coral-bg text-ops-coral",  badge: "bg-ops-coral-bg text-ops-coral" },
  amber: { icon: "bg-ops-amber-bg text-ops-amber",  badge: "bg-ops-amber-bg text-ops-amber" },
  navy:  { icon: "bg-ops-sel text-ops-blue",         badge: "bg-ops-sel text-ops-blue" },
}

export function KPICard({
  label,
  value,
  sub,
  icon,
  tone = "blue",
  delta,
  className,
}: {
  label: string
  value: ReactNode
  sub?: string
  icon: ReactNode
  tone?: KPITone
  delta?: { pct: number | null; positive?: boolean } | null
  className?: string
}) {
  const t = KPI_TONES[tone]

  let deltaPill: ReactNode = null
  if (delta !== undefined && delta !== null) {
    if (delta.pct === null) {
      deltaPill = (
        <span className="inline-flex items-center rounded-full bg-ops-s2 px-2.5 py-0.5 text-[11px] text-ops-tx3">
          Sin datos comparables
        </span>
      )
    } else {
      const up = delta.positive !== undefined ? delta.positive : delta.pct >= 0
      const abs = Math.abs(delta.pct).toFixed(0)
      deltaPill = up ? (
        <span className="inline-flex items-center rounded-full bg-ops-green-bg px-2.5 py-0.5 text-[11px] font-semibold text-ops-green">
          ▲ {abs}%
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full bg-ops-coral-bg px-2.5 py-0.5 text-[11px] font-semibold text-ops-coral">
          ▼ {abs}%
        </span>
      )
    }
  }

  return (
    <div className={cn("relative flex flex-col gap-3 rounded-[20px] border border-ops-line bg-ops-s1 p-5 shadow-ops-card", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ops-tx3">{label}</p>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", t.icon)}>
          {icon}
        </span>
      </div>
      <div>
        <p className="text-[32px] font-bold leading-none tabular-nums tracking-tight text-ops-tx">
          {value}
        </p>
        {sub && <p className="mt-1 text-xs text-ops-tx3">{sub}</p>}
      </div>
      {deltaPill && <div>{deltaPill}</div>}
    </div>
  )
}

/* ─── StatusChip ──────────────────────────────────────────────────────────── */
type Tone = "green" | "amber" | "coral" | "blue" | "cold" | "neutral"
const TONES: Record<Tone, string> = {
  green:   "border border-ops-green/30 bg-ops-green-bg text-ops-green",
  amber:   "border border-ops-amber/30 bg-ops-amber-bg text-ops-amber",
  coral:   "border border-ops-coral/30 bg-ops-coral-bg text-ops-coral",
  blue:    "border border-ops-blue/30 bg-ops-blue-bg text-ops-blue",
  cold:    "border border-ops-cold/30 bg-ops-blue-bg text-ops-cold",
  neutral: "border border-ops-bd bg-ops-s2 text-ops-tx2",
}

/** Chip de estado: píldora con borde + punto + texto. */
export function StatusChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium", TONES[tone])}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}

/* ─── Tabla ───────────────────────────────────────────────────────────────── */
export const opsTable = {
  wrap: "overflow-x-auto",
  table: "w-full min-w-[720px] border-collapse text-[13px]",
  th: "h-9 border-y border-ops-line bg-ops-th-bg px-3 text-left text-xs font-semibold uppercase tracking-wide text-ops-tx3",
  thRight: "h-9 border-y border-ops-line bg-ops-th-bg px-3 text-right text-xs font-semibold uppercase tracking-wide text-ops-tx3",
  td: "border-b border-ops-line px-3 py-3 text-ops-tx",
  tdRight: "border-b border-ops-line px-3 py-3 text-right text-ops-tx",
  row: "transition-colors hover:bg-ops-hover",
  mono: "font-plex tabular-nums",
} as const

export const opsField =
  "h-9 rounded-lg border border-ops-bd bg-ops-s1 px-3 text-[13px] text-ops-tx outline-none transition-colors placeholder:text-ops-tx3 hover:border-ops-bd2 focus-visible:border-ops-blue focus-visible:ring-2 focus-visible:ring-ops-blue/20"

export const opsIconBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-ops-tx2 transition-colors hover:bg-ops-hover hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-ops-blue"

/* ─── Botones estándar ────────────────────────────────────────────────────── */
/** Botón primario: coral sólido */
export const opsBtnPrimary =
  "inline-flex items-center gap-1.5 rounded-full bg-ops-coral px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"

/** Botón secundario: borde con fondo blanco */
export const opsBtnSecondary =
  "inline-flex items-center gap-1.5 rounded-full border border-ops-bd bg-ops-s1 px-4 py-2 text-sm font-medium text-ops-tx transition-colors hover:bg-ops-hover disabled:opacity-50"

/** Botón ghost: sin borde, para acciones sobre navy */
export const opsBtnNavy =
  "inline-flex items-center gap-1.5 rounded-full border border-ops-navy-tx2/30 bg-ops-navy-tx2/10 px-4 py-2 text-sm font-medium text-ops-navy-tx transition-colors hover:bg-ops-navy-tx2/20 disabled:opacity-50"

/* ─── EmptyState ─────────────────────────────────────────────────────────── */
export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode
  title: string
  text?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-ops-blue-bg text-ops-blue">
        {icon}
      </div>
      <p className="text-sm font-semibold text-ops-tx">{title}</p>
      {text ? <p className="max-w-xs text-xs text-ops-tx2">{text}</p> : null}
      {action}
    </div>
  )
}

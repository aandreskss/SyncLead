import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Contenedor de página del dashboard: padding y separación estándar. */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-5 px-4 py-5 md:px-7 md:py-6", className)}>{children}</div>
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-ops-tx">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-ops-tx2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/** Panel con borde de 1px, radio 8px, sin sombras ni degradados. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-ops-line bg-ops-s1", className)}>
      {title ? (
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ops-tx">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-ops-tx2">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

type Tone = "green" | "amber" | "coral" | "blue" | "cold" | "neutral"
const TONES: Record<Tone, string> = {
  green: "bg-ops-green/12 text-ops-green",
  amber: "bg-ops-amber/12 text-ops-amber",
  coral: "bg-ops-coral/12 text-ops-coral",
  blue: "bg-ops-blue/15 text-ops-blue-t",
  cold: "bg-ops-cold/12 text-ops-cold",
  neutral: "bg-ops-s2 text-ops-tx2",
}
/** Chip de estado: siempre texto + punto, nunca solo color. */
export function StatusChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded px-2 text-xs font-medium", TONES[tone])}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}

/** Clases reutilizables para tablas densas. */
export const opsTable = {
  wrap: "overflow-x-auto",
  table: "w-full min-w-[720px] border-collapse text-[13px]",
  th: "h-9 border-y border-ops-line bg-ops-side px-3 text-left text-xs font-medium text-ops-tx3",
  thRight: "h-9 border-y border-ops-line bg-ops-side px-3 text-right text-xs font-medium text-ops-tx3",
  td: "border-b border-ops-line px-3 py-3 text-ops-tx",
  tdRight: "border-b border-ops-line px-3 py-3 text-right text-ops-tx",
  row: "transition-colors hover:bg-ops-hover",
  mono: "font-plex tabular-nums",
} as const

export const opsField =
  "h-9 rounded-md border border-ops-bd bg-ops-s1 px-3 text-[13px] text-ops-tx outline-none transition-colors placeholder:text-ops-tx3 hover:border-ops-bd2 focus-visible:border-ops-blue focus-visible:ring-2 focus-visible:ring-ops-blue/40"

export const opsIconBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-ops-tx2 transition-colors hover:bg-ops-hover hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-ops-blue"

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
    <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ops-s2 text-ops-tx2">{icon}</div>
      <p className="text-sm font-medium text-ops-tx">{title}</p>
      {text ? <p className="max-w-xs text-xs text-ops-tx2">{text}</p> : null}
      {action}
    </div>
  )
}

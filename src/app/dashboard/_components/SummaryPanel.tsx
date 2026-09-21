import Link from "next/link"
import { ArrowUpRight, CircleCheck, TriangleAlert } from "lucide-react"
import { fmt, fmtMoney } from "./format"

export interface Insight {
  text: string
  hint?: string
  ok?: boolean
}

interface Props {
  leads: number
  sales: number
  conversionRate: number | null
  avgTicket: number | null
  insights: Insight[]
  trackingHref: string
}

export function SummaryPanel({ leads, sales, conversionRate, avgTicket, insights, trackingHref }: Props) {
  const steps = [
    { v: fmt(leads), t: leads === 1 ? "lead captado" : "leads captados" },
    { v: fmt(sales), t: sales === 1 ? "venta" : "ventas" },
    { v: conversionRate === null ? "N/D" : `${fmt(conversionRate, 0)} %`, t: "de conversión" },
    { v: avgTicket === null ? "N/D" : fmtMoney(avgTicket).replace(/,00$/, ""), t: "de ingreso promedio por venta" },
  ]
  return (
    <section aria-label="Resumen del periodo" className="h-full rounded-lg border border-ops-line bg-ops-s1 p-4 lg:p-5">
      <h2 className="text-base font-semibold text-ops-tx">Resumen del periodo</h2>
      <ol className="mt-4">
        {steps.map((s, i) => (
          <li key={s.t} className="relative flex items-baseline gap-3.5 pb-3.5 pl-[22px] last:pb-0">
            {i < steps.length - 1 && <span aria-hidden className="absolute bottom-[-14px] left-[5px] top-[18px] w-px bg-ops-bd" />}
            <span aria-hidden className="absolute left-px top-[9px] h-[9px] w-[9px] rounded-full border-2 border-ops-blue bg-ops-s1" />
            <span className="font-plex min-w-14 text-[22px] font-medium tracking-tight text-ops-tx">{s.v}</span>
            <span className="text-sm text-ops-tx2">{s.t}</span>
          </li>
        ))}
      </ol>

      <h3 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-[0.08em] text-ops-tx3">Qué revisar</h3>
      <ul>
        {insights.map((i) => (
          <li key={i.text} className="flex items-start gap-2.5 border-t border-ops-line py-2.5">
            {i.ok ? (
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ops-green" aria-hidden="true" />
            ) : (
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-ops-amber" aria-hidden="true" />
            )}
            <span className="text-sm leading-snug text-ops-tx">
              {i.text}
              {i.hint && <span className="mt-0.5 block text-[13px] text-ops-tx3">{i.hint}</span>}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href={trackingHref}
        className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg border border-ops-bd px-3 text-[13px] font-medium text-ops-tx transition-colors duration-150 hover:border-ops-bd2 hover:bg-ops-raised"
      >
        Revisar configuración del tracking
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </section>
  )
}

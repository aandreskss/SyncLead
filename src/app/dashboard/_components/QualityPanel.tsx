import Link from "next/link"
import { ChevronRight, CircleCheck, CircleMinus, CircleX, TriangleAlert } from "lucide-react"
import { fmt } from "./format"

export interface QualityCheck {
  label: string
  value: string
  status: "ok" | "warn" | "bad" | "unknown"
}

interface Props {
  temp: { hot: number; warm: number; cold: number }
  checks: QualityCheck[]
  totalLeads: number
  diagnosticHref: string
}

const ICON = {
  ok: <CircleCheck className="h-[18px] w-[18px] text-ops-green" aria-hidden="true" />,
  warn: <TriangleAlert className="h-[18px] w-[18px] text-ops-amber" aria-hidden="true" />,
  bad: <CircleX className="h-[18px] w-[18px] text-ops-coral" aria-hidden="true" />,
  unknown: <CircleMinus className="h-[18px] w-[18px] text-ops-tx3" aria-hidden="true" />,
}

const STATUS_TEXT = { ok: "Correcto", warn: "Requiere atención", bad: "Incidencia", unknown: "Datos insuficientes" }

function Temperature({ temp }: { temp: Props["temp"] }) {
  const total = temp.hot + temp.warm + temp.cold
  const rows = [
    { label: "Calientes", n: temp.hot, color: "#f06f65" },
    { label: "Tibios", n: temp.warm, color: "#e7a84b" },
    { label: "Fríos", n: temp.cold, color: "#6bb7e8" },
  ]
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)
  return (
    <div className="p-4 lg:p-6">
      <h2 className="text-base font-semibold text-ops-tx">Temperatura de los leads</h2>
      <p className="mt-1 text-[13px] text-ops-tx2">
        {total === 1 ? "1 lead clasificado" : `${fmt(total)} leads clasificados`}
      </p>
      {total > 0 ? (
        <div
          role="img"
          aria-label={rows.map((r) => `${r.label} ${fmt(pct(r.n), 0)} %`).join(", ")}
          className="mt-4 flex h-2.5 gap-0.5"
        >
          {rows
            .filter((r) => r.n > 0)
            .map((r) => (
              <span key={r.label} className="first:rounded-l last:rounded-r" style={{ flex: r.n, background: r.color }} />
            ))}
        </div>
      ) : (
        <div className="mt-4 h-2.5 rounded bg-ops-line" aria-hidden />
      )}
      <ul className="mt-2">
        {rows.map((r, i) => (
          <li key={r.label} className={`flex h-11 items-center gap-2.5 text-sm ${i < 2 ? "border-b border-ops-line" : ""}`}>
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
            <span className="flex-1">{r.label}</span>
            <span className="font-plex min-w-7 text-right font-medium">{fmt(r.n)}</span>
            <span className="font-plex min-w-[52px] text-right text-ops-tx2">{fmt(pct(r.n), 0)} %</span>
          </li>
        ))}
      </ul>
      {total > 0 && temp.hot > 0 && (
        <p className="mt-2 text-[13px] leading-relaxed text-ops-tx2">
          {temp.hot === total ? "Todos los leads tienen temperatura alta" : `${fmt(pct(temp.hot), 0)} % de los leads tiene temperatura alta`}: son los primeros a contactar.
        </p>
      )}
    </div>
  )
}

function Attribution({ checks, totalLeads, diagnosticHref }: Omit<Props, "temp">) {
  const okCount = checks.filter((c) => c.status === "ok").length
  const verdict =
    totalLeads === 0
      ? { text: "Sin datos", cls: "bg-[#1a222d] text-ops-tx2" }
      : okCount === checks.length
        ? { text: "Tracking completo", cls: "bg-[#12241f] text-ops-green" }
        : { text: "Tracking incompleto", cls: "bg-[#2a2213] text-ops-amber" }
  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ops-tx">Calidad de atribución</h2>
          <p className="mt-1 text-[13px] text-ops-tx2">
            {okCount} de {checks.length} comprobaciones completas
          </p>
        </div>
        <span className={`inline-flex h-6 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium ${verdict.cls}`}>{verdict.text}</span>
      </div>
      <ul className="mt-3.5">
        {checks.map((c, i) => (
          <li key={c.label} className={`flex h-12 items-center gap-3 text-sm ${i < checks.length - 1 ? "border-b border-ops-line" : ""}`}>
            {ICON[c.status]}
            <span className="flex-1 text-ops-tx2">{c.label}</span>
            <span className="text-right font-medium">
              {c.value}
              <span className="sr-only"> — {STATUS_TEXT[c.status]}</span>
            </span>
          </li>
        ))}
      </ul>
      {okCount < checks.length && totalLeads > 0 && (
        <p className="mb-4 mt-3 text-[13px] leading-relaxed text-ops-tx2">
          Sin plataforma, dispositivo ni UTM no se puede saber qué canales y anuncios traen leads que terminan en venta. Verifica que los formularios envíen los parámetros UTM y que el tracking esté activo.
        </p>
      )}
      <Link
        href={diagnosticHref}
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-ops-bd px-3 text-[13px] font-medium text-ops-tx transition-colors duration-150 hover:border-ops-bd2 hover:bg-ops-raised"
      >
        Ver diagnóstico
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  )
}

export function QualityPanel({ temp, checks, totalLeads, diagnosticHref }: Props) {
  return (
    <section aria-label="Calidad y distribución de leads" className="grid rounded-lg border border-ops-line bg-ops-s1 lg:grid-cols-[1fr_1px_1fr]">
      <Temperature temp={temp} />
      <div aria-hidden className="h-px bg-ops-line lg:h-auto lg:w-px" />
      <Attribution checks={checks} totalLeads={totalLeads} diagnosticHref={diagnosticHref} />
    </section>
  )
}

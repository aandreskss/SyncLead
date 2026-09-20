"use client"

import { useState } from "react"
import { DAYS, ROWS } from "./data"
import { Kpi, Sample } from "./ui"

export function Analytics() {
  const [ins, setIns] = useState(false)
  const nd = (v: string) => (ins ? v : "N/D")
  const ndCls = ins ? "text-sg-ink" : "text-sg-subtle"

  return (
    <div className="mt-10 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={ins}
          onClick={() => setIns((v) => !v)}
          className="inline-flex min-h-11 items-center gap-3 rounded-xl border border-sg-border-strong/50 bg-sg-s2 px-4 text-sm font-medium"
        >
          <span
            aria-hidden
            className={`relative h-5 w-9 rounded-full transition-colors duration-[var(--sg-dur-quick)] ${ins ? "bg-sg-accent" : "bg-sg-s4"}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-sg-ink transition-transform duration-[var(--sg-dur-quick)] ${ins ? "translate-x-[1.125rem]" : "translate-x-0.5"}`}
            />
          </span>
          Simular Meta Ads Insights conectado
        </button>
        <Sample />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Kpi label="Leads" value="870" />
        <Kpi label="Ventas" value="51" />
        <Kpi label="Conversión" value="5,9 %" />
        <Kpi label="Ingresos" value="USD 12.699" />
        <Kpi label="CPL" value={nd("USD 3,10")} tone={ndCls} note={ins ? "Ejemplo" : "Requiere Insights"} />
        <Kpi label="CPA" value={nd("USD 52,94")} tone={ndCls} note={ins ? "Ejemplo" : "Requiere Insights"} />
        <Kpi label="ROAS" value={nd("4,7x")} tone={ndCls} note={ins ? "Ejemplo" : "Requiere Insights"} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-sg-border bg-sg-s1">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">Rendimiento por campaña y anuncio</caption>
          <thead>
            <tr className="border-b border-sg-border text-xs text-sg-subtle">
              {["Campaña · anuncio", "Leads", "Ventas", "Conv.", "Ingresos", "CPL", "CPA", "ROAS"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.ad} className="border-b border-sg-border last:border-b-0">
                <td className="px-3 py-2.5">
                  <span className="block font-medium">{r.camp}</span>
                  <span className="text-xs text-sg-muted">{r.ad}</span>
                </td>
                <td className="sg-tabular px-3 font-mono">{r.leads}</td>
                <td className="sg-tabular px-3 font-mono">{r.sales}</td>
                <td className="sg-tabular px-3 font-mono">{r.conv}</td>
                <td className="sg-tabular px-3 font-mono">{r.rev}</td>
                <td className={`px-3 font-mono ${ndCls}`}>{nd(r.cpl)}</td>
                <td className={`px-3 font-mono ${ndCls}`}>{nd(r.cpa)}</td>
                <td className={`px-3 font-mono ${ndCls}`}>{nd(r.roas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-sg-border bg-sg-s1 p-5">
        <p className="text-sm font-medium">Tendencia semanal</p>
        <p className="text-xs text-sg-subtle">Cada celda: leads · ventas</p>
        <ul className="mt-4 grid grid-cols-7 gap-2">
          {DAYS.map((d) => (
            <li key={d.d} className="rounded-lg border border-sg-border bg-sg-bg p-2 text-center">
              <p className="text-[11px] text-sg-subtle">{d.d}</p>
              <p className="sg-tabular font-mono text-xs sm:text-sm">
                {d.l} · {d.s}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-sg-muted">
          En los últimos 7 días los leads pasaron de 104 a 147 por día y las ventas de 5 a 9. Total: 870 leads y 51 ventas. Importes en dólares (USD), con formato es-VE.
        </p>
      </div>
    </div>
  )
}

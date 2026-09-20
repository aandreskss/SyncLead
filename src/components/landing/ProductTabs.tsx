"use client"

import { useRef, useState } from "react"
import { DAYS, FUNNEL, LEADS, ROWS } from "./data"
import { FunnelBars, HeatBadge, Kpi, Sample } from "./ui"

const TABS = ["Dashboard", "Leads", "Funnel", "Rendimiento", "Conversiones"] as const

const CAPI_ROWS = [
  ["Mariana López", "Recibido por Meta", "text-sg-green"],
  ["Tomás Herrera", "Enviado", "text-sg-cyan"],
  ["Valentina Cruz", "Reintentando", "text-sg-warm"],
  ["Andrés Molina", "Pendiente", "text-sg-muted"],
  ["Sofía Vega", "Error", "text-sg-danger"],
]

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead>
          <tr className="border-b border-sg-border text-xs text-sg-subtle">
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:px-3 [&_td]:py-2.5 [&_tr]:border-b [&_tr]:border-sg-border">{children}</tbody>
      </table>
    </div>
  )
}

export function ProductTabs() {
  const [tab, setTab] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const maxDay = Math.max(...DAYS.map((d) => d.l))

  function onKey(e: React.KeyboardEvent, i: number) {
    let n = i
    if (e.key === "ArrowRight") n = (i + 1) % TABS.length
    else if (e.key === "ArrowLeft") n = (i - 1 + TABS.length) % TABS.length
    else if (e.key === "Home") n = 0
    else if (e.key === "End") n = TABS.length - 1
    else return
    e.preventDefault()
    setTab(n)
    refs.current[n]?.focus()
  }

  return (
    <div className="mt-10">
      <div className="overflow-x-auto pb-1">
        <div role="tablist" aria-label="Vistas del producto" className="mx-auto flex w-max gap-1 rounded-xl border border-sg-border bg-sg-s1 p-1">
          {TABS.map((t, i) => (
            <button
              key={t}
              ref={(el) => {
                refs.current[i] = el
              }}
              role="tab"
              id={`tab-${i}`}
              aria-selected={tab === i}
              aria-controls="tabpanel"
              tabIndex={tab === i ? 0 : -1}
              onClick={() => setTab(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold transition-colors duration-[var(--sg-dur-quick)] sm:px-6 ${
                tab === i ? "bg-sg-s4 text-sg-ink" : "text-sg-muted hover:text-sg-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0} className="mt-6 rounded-2xl border border-sg-border bg-sg-s1 p-4 shadow-sg-float sm:p-6">
        <div key={tab} className="sg-rise">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-medium">{TABS[tab]}</p>
            <Sample />
          </div>
          {tab === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Leads" value="870" note="+12,4 % vs. semana anterior" />
                <Kpi label="Ventas" value="51" note="+9 vs. semana anterior" />
                <Kpi label="Conversión" value="5,9 %" note="+0,4 pts" />
                <Kpi label="Ingresos" value="USD 12.699" note="Ticket USD 249" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-sg-border bg-sg-bg p-4">
                  <p className="mb-3 text-xs font-medium text-sg-muted">Leads y ventas por día</p>
                  <div className="flex h-28 items-end gap-2" role="img" aria-label="Leads por día, de 104 el lunes a 147 el domingo">
                    {DAYS.map((d) => (
                      <div key={d.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                        <div className="w-full rounded-t bg-sg-accent" style={{ height: `${(d.l / maxDay) * 100}%` }} />
                        <span className="text-[10px] text-sg-subtle">{d.d}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-sg-border bg-sg-bg p-4">
                  <p className="mb-3 text-xs font-medium text-sg-muted">Funnel</p>
                  <FunnelBars />
                </div>
              </div>
            </div>
          )}
          {tab === 1 && (
            <Table head={["Lead", "Anuncio", "Calificación", "Vendedor", "Recibido"]}>
              {LEADS.map((l) => (
                <tr key={l.name}>
                  <td className="font-medium">{l.name}</td>
                  <td className="text-sg-muted">{l.ad}</td>
                  <td>
                    <HeatBadge heat={l.heat} />
                  </td>
                  <td className="text-sg-muted">{l.rep}</td>
                  <td className="text-sg-subtle">{l.when}</td>
                </tr>
              ))}
            </Table>
          )}
          {tab === 2 && (
            <div className="space-y-3">
              <ul className="grid gap-3 sm:grid-cols-5">
                {FUNNEL.map((f, i) => (
                  <li key={f.name} className="rounded-xl border border-sg-border bg-sg-bg p-3">
                    <p className="text-xs text-sg-subtle">{f.name}</p>
                    <p className="sg-tabular font-mono text-xl">{f.n}</p>
                    <p className="text-[11px] text-sg-muted">
                      {i === 0 ? "Entrada del funnel" : `vs. etapa anterior: ${((f.n / FUNNEL[i - 1].n) * 100).toFixed(1).replace(".", ",")} %`}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-sg-muted">Mayor caída: Contactado → Interesado. De 512 leads contactados, 231 muestran interés.</p>
            </div>
          )}
          {tab === 3 && (
            <div className="space-y-3">
              <Table head={["Campaña · anuncio", "Leads", "Ventas", "Conv.", "Ingresos", "CPL", "CPA", "ROAS"]}>
                {ROWS.map((r) => (
                  <tr key={r.ad}>
                    <td>
                      <span className="block font-medium">{r.camp}</span>
                      <span className="text-xs text-sg-muted">{r.ad}</span>
                    </td>
                    <td className="sg-tabular font-mono">{r.leads}</td>
                    <td className="sg-tabular font-mono">{r.sales}</td>
                    <td className="sg-tabular font-mono">{r.conv}</td>
                    <td className="sg-tabular font-mono">{r.rev}</td>
                    <td className="font-mono text-sg-subtle">N/D</td>
                    <td className="font-mono text-sg-subtle">N/D</td>
                    <td className="font-mono text-sg-subtle">N/D</td>
                  </tr>
                ))}
              </Table>
              <p className="text-xs text-sg-muted">Conecta Meta Ads Insights: CPL, CPA y ROAS aparecen solo cuando existe sincronización.</p>
            </div>
          )}
          {tab === 4 && (
            <div className="space-y-3">
              <Table head={["Lead", "Evento", "Valor", "Estado en Meta"]}>
                {CAPI_ROWS.map(([n, st, cls]) => (
                  <tr key={n}>
                    <td className="font-medium">{n}</td>
                    <td className="text-sg-muted">Purchase</td>
                    <td className="sg-tabular font-mono">USD 249</td>
                    <td className={`font-medium ${cls}`}>{st}</td>
                  </tr>
                ))}
              </Table>
              <p className="text-xs text-sg-muted">Cada estado tiene nombre y color: no dependes solo del color para distinguirlos.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

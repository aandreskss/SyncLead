"use client"

import { useState } from "react"
import { ArrowRight } from "lucide-react"

const STAGES = ["Nuevo", "Contactado", "Calificado", "Cerrado"] as const
type Stage = (typeof STAGES)[number]

type Lead = { id: string; name: string; temp: "Caliente" | "Tibio" | "Frío"; stage: Stage }

const TEMP_CLS: Record<Lead["temp"], string> = {
  Caliente: "border-sg-hot/50 bg-sg-hot/10 text-sg-hot",
  Tibio: "border-sg-warm/50 bg-sg-warm/10 text-sg-warm",
  Frío: "border-sg-cold/50 bg-sg-cold/10 text-sg-cold",
}

const INITIAL: Lead[] = [
  { id: "a", name: "Lead de ejemplo A", temp: "Caliente", stage: "Nuevo" },
  { id: "b", name: "Lead de ejemplo B", temp: "Tibio", stage: "Nuevo" },
  { id: "c", name: "Lead de ejemplo C", temp: "Frío", stage: "Contactado" },
  { id: "d", name: "Lead de ejemplo D", temp: "Tibio", stage: "Calificado" },
]

export function KanbanDemo() {
  const [leads, setLeads] = useState<Lead[]>(INITIAL)
  const [live, setLive] = useState("")

  function advance(id: string) {
    setLeads((cur) =>
      cur.map((l) => {
        if (l.id !== id) return l
        const next = STAGES[Math.min(STAGES.indexOf(l.stage) + 1, STAGES.length - 1)]
        setLive(`${l.name} movido a ${next}`)
        return { ...l, stage: next }
      }),
    )
  }

  return (
    <div className="rounded-2xl border border-sg-border bg-sg-s1 p-4 shadow-sg-raise sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Embudo interactivo</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setLeads(INITIAL)
              setLive("Demo reiniciada")
            }}
            className="rounded-md px-2 py-1 text-xs text-sg-muted hover:text-sg-ink"
          >
            Reiniciar
          </button>
          <span className="text-[11px] text-sg-subtle">Datos de ejemplo</span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stage) => {
          const items = leads.filter((l) => l.stage === stage)
          return (
            <section key={stage} aria-label={`Etapa ${stage}`} className="rounded-xl border border-sg-border bg-sg-bg p-2.5">
              <h4 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-sg-muted">
                {stage}
                <span className="sg-tabular font-mono text-sg-subtle">{items.length}</span>
              </h4>
              <ul className="min-h-[3.5rem] space-y-2">
                {items.map((l) => (
                  <li key={l.id} className="sg-rise rounded-lg border border-sg-border bg-sg-s2 p-2.5">
                    <p className="text-[13px] font-medium">{l.name}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${TEMP_CLS[l.temp]}`}>{l.temp}</span>
                      {l.stage !== "Cerrado" ? (
                        <button
                          type="button"
                          onClick={() => advance(l.id)}
                          aria-label={`Mover ${l.name} a la siguiente etapa`}
                          className="sg-press inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-sg-accent hover:bg-sg-s3"
                        >
                          Avanzar <ArrowRight className="h-3 w-3" aria-hidden />
                        </button>
                      ) : (
                        <span className="text-xs text-sg-green">Venta</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {live}
      </p>
    </div>
  )
}

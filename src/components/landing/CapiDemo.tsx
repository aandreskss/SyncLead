"use client"

import { useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"

const STEPS = [
  { title: "Venta registrada", detail: "Marcas el lead como cerrado en tu CRM." },
  { title: "Evento preparado", detail: "SyncLead arma el evento de conversión con los datos del lead." },
  { title: "Enviado a Meta CAPI", detail: "El evento viaja por Conversions API con el token guardado cifrado." },
]

export function CapiDemo() {
  const [step, setStep] = useState(-1)
  const running = step >= 0 && step < STEPS.length

  useEffect(() => {
    if (!running) return
    const t = window.setTimeout(() => setStep((s) => s + 1), 900)
    return () => window.clearTimeout(t)
  }, [running, step])

  return (
    <div className="rounded-2xl border border-sg-border bg-sg-s1 p-5 shadow-sg-raise">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Simulador de conversión</p>
        <span className="text-[11px] text-sg-subtle">Simulación: no envía datos</span>
      </div>
      <ol className="mt-5 space-y-4">
        {STEPS.map((s, i) => {
          const done = step > i
          const active = step === i
          return (
            <li key={s.title} className="flex gap-3">
              <span
                aria-hidden
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs transition-colors duration-[var(--sg-dur-standard)] ${
                  done
                    ? "border-sg-green bg-sg-green text-sg-on-signal"
                    : active
                      ? "border-sg-cyan text-sg-cyan"
                      : "border-sg-border text-sg-subtle"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : i + 1}
              </span>
              <div>
                <p className={`text-sm font-medium ${done || active ? "text-sg-ink" : "text-sg-muted"}`}>
                  {s.title}
                  {done && <span className="sr-only"> (completado)</span>}
                </p>
                <p className="text-xs leading-relaxed text-sg-subtle">{s.detail}</p>
              </div>
            </li>
          )
        })}
      </ol>
      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          disabled={running}
          onClick={() => setStep(0)}
          className="sg-press inline-flex min-h-10 items-center rounded-lg bg-sg-green px-4 text-sm font-semibold text-sg-on-signal disabled:opacity-60"
        >
          {step >= STEPS.length ? "Repetir simulación" : "Simular venta"}
        </button>
        <p role="status" aria-live="polite" className="text-xs text-sg-muted">
          {step >= STEPS.length ? "Conversión enviada (simulada)." : running ? "Procesando…" : ""}
        </p>
      </div>
    </div>
  )
}

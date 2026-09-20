"use client"

import { useState } from "react"
import { Check } from "lucide-react"
import { Sample } from "./ui"

type Key = "sent" | "pending" | "retry" | "error"

const STATES: Record<Key, { label: string; cls: string; msg: string }> = {
  sent: { label: "Enviado", cls: "text-sg-green border-sg-green/50 bg-sg-green/10", msg: "Meta confirmó la recepción del evento." },
  pending: { label: "Pendiente", cls: "text-sg-muted border-sg-border bg-sg-s3", msg: "El evento está guardado y espera su turno de envío." },
  retry: { label: "Reintentando", cls: "text-sg-warm border-sg-warm/50 bg-sg-warm/10", msg: "Meta no respondió. SyncLead reintenta sin perder el evento." },
  error: { label: "Error", cls: "text-sg-danger border-sg-danger/50 bg-sg-danger/10", msg: "No se pudo enviar tras los reintentos. Revisa la conexión con Meta e inténtalo de nuevo." },
}

export function CapiDemo() {
  const [k, setK] = useState<Key>("sent")
  const s = STATES[k]
  const completed = k === "sent" ? 5 : 3

  const steps = [
    { t: "Lead capturado", d: "Mariana López" },
    { t: "Venta registrada", d: "USD 249" },
    { t: "Evento guardado", d: "Listo para enviar" },
    { t: "Envío a Meta", d: s.label },
    { t: "Confirmación recibida", d: k === "sent" ? "Evento recibido" : "Aún sin confirmar" },
  ]

  return (
    <div className="rounded-2xl border border-sg-border bg-sg-s1 p-5 shadow-sg-raise">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Estado de la conversión</p>
        <Sample />
      </div>
      <div role="group" aria-label="Simular estado" className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(STATES) as Key[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={k === key}
            onClick={() => setK(key)}
            className={`sg-press min-h-11 rounded-xl border px-4 text-sm font-semibold ${
              k === key ? "border-sg-accent bg-sg-accent text-sg-on-accent" : "border-sg-border-strong/50 bg-sg-s2 text-sg-ink"
            }`}
          >
            {STATES[key].label}
          </button>
        ))}
      </div>
      <ol className="mt-5 space-y-3">
        {steps.map((st, i) => {
          const done = i < completed
          const active = k === "retry" && i === 3
          return (
            <li key={st.t} className="flex gap-3">
              <span
                aria-hidden
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs transition-colors duration-[var(--sg-dur-standard)] ${
                  done ? "border-sg-green bg-sg-green text-sg-on-signal" : active ? "border-sg-accent text-sg-accent" : "border-sg-border text-sg-subtle"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div>
                <p className={`text-sm font-medium ${done || active ? "text-sg-ink" : "text-sg-muted"}`}>{st.t}</p>
                <p className="text-xs text-sg-subtle">{st.d}</p>
              </div>
            </li>
          )
        })}
      </ol>
      <div role="status" aria-live="polite" className={`mt-5 rounded-xl border p-3 text-sm ${s.cls}`}>
        <p className="font-semibold">{s.label}</p>
        <p className="mt-0.5 text-xs opacity-90">{s.msg}</p>
      </div>
      <p className="mt-3 text-xs text-sg-muted">Venta guardada no significa Meta notificado: cada estado se muestra por separado.</p>
    </div>
  )
}

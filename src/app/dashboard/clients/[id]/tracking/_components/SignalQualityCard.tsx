"use client"

import { useState, useTransition } from "react"
import { getSignalQualityAction } from "@/domains/meta-audiences/actions"
import { ShieldCheck, Loader2, RefreshCw } from "lucide-react"

type EventScore = { eventName: string; score: number | null }

function scoreColor(score: number | null): string {
  if (score === null) return "text-ops-tx3"
  if (score >= 8) return "text-emerald-400"
  if (score >= 6) return "text-amber-400"
  if (score >= 4) return "text-orange-400"
  return "text-red-400"
}

function scoreBg(score: number | null): string {
  if (score === null) return "bg-ops-s2 border-ops-bd"
  if (score >= 8) return "bg-emerald-900/20 border-emerald-800"
  if (score >= 6) return "bg-amber-900/20 border-amber-800"
  if (score >= 4) return "bg-orange-900/20 border-orange-800"
  return "bg-red-900/20 border-red-800"
}

function scoreLabel(score: number | null): string {
  if (score === null) return "Sin datos"
  if (score >= 8) return "Excelente"
  if (score >= 6) return "Bueno"
  if (score >= 4) return "Regular"
  return "Deficiente"
}

const EVENT_LABELS: Record<string, string> = {
  Purchase: "Compra",
  Lead: "Lead",
  Contact: "Contacto",
  ViewContent: "Vista de contenido",
  AddToCart: "Carrito",
  InitiateCheckout: "Checkout",
  CompleteRegistration: "Registro",
}

export function SignalQualityCard({ clientId }: { clientId: string }) {
  const [events, setEvents] = useState<EventScore[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  function load() {
    setError(null)
    start(async () => {
      const result = await getSignalQualityAction(clientId)
      if ("error" in result) {
        setError(result.error === "no_connection" ? "No hay conexión Meta activa con Pixel ID" : "No se pudo obtener el score")
      } else {
        setEvents(result.events.filter((e) => e.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)))
      }
    })
  }

  return (
    <div className="rounded-lg border border-ops-line bg-ops-s1 overflow-hidden">
      <div className="flex items-center justify-between border-b border-ops-line px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-ops-blue" />
          <p className="text-sm font-semibold text-ops-tx">Calidad de señal CAPI</p>
        </div>
        <button
          onClick={load}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded border border-ops-bd bg-ops-s2 px-2.5 py-1.5 text-xs text-ops-tx2 hover:bg-ops-sel transition-colors disabled:opacity-50"
        >
          {isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />}
          {events ? "Actualizar" : "Ver scores"}
        </button>
      </div>

      <div className="p-4">
        {error && (
          <p className="text-sm text-ops-coral">{error}</p>
        )}

        {!events && !error && (
          <p className="text-sm text-ops-tx3">
            Muestra cuán bien llegan los datos de usuario en cada evento CAPI (0–10). Un score bajo significa que Meta no puede atribuir eventos correctamente.
          </p>
        )}

        {events && events.length === 0 && (
          <p className="text-sm text-ops-tx3">Sin eventos CAPI reportados aún. Envía al menos una venta para ver el score.</p>
        )}

        {events && events.length > 0 && (
          <div className="space-y-2">
            {events.map((ev) => (
              <div key={ev.eventName} className="flex items-center gap-3">
                <div className="w-28 shrink-0">
                  <p className="text-xs text-ops-tx2 truncate">
                    {EVENT_LABELS[ev.eventName] ?? ev.eventName}
                  </p>
                </div>
                {/* Score bar */}
                <div className="flex-1 h-2 rounded-full bg-ops-s2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      ev.score !== null
                        ? ev.score >= 8 ? "bg-emerald-500"
                        : ev.score >= 6 ? "bg-amber-500"
                        : ev.score >= 4 ? "bg-orange-500"
                        : "bg-red-500"
                        : "bg-ops-bd"
                    }`}
                    style={{ width: `${Math.min(100, ((ev.score ?? 0) / 10) * 100)}%` }}
                  />
                </div>
                <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${scoreBg(ev.score)} ${scoreColor(ev.score)}`}>
                  {ev.score !== null ? ev.score.toFixed(1) : "—"}
                </span>
                <span className={`shrink-0 text-xs ${scoreColor(ev.score)}`}>
                  {scoreLabel(ev.score)}
                </span>
              </div>
            ))}
            <p className="text-[10px] text-ops-tx3 mt-3">
              Score 0–10 · Meta Event Match Quality · Valores calculados por Meta en base a los últimos 7 días
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

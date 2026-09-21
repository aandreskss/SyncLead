"use client"

import { useState, useEffect, useTransition } from "react"
import { Zap, RefreshCw, Loader2, AlertCircle } from "lucide-react"
import {
  getClientMetaEventsAction,
  retryFailedCapiForClientAction,
} from "@/domains/health/actions"
import type { ClientMetaEventRow } from "@/domains/health/repository"

interface Props {
  clientId: string
}

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (minutes < 1) return "ahora mismo"
  if (minutes < 60) return `hace ${minutes}m`
  if (hours < 24) return `hace ${hours}h`
  return `hace ${days}d`
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    sent: { label: "Enviado", cls: "bg-emerald-500/15 text-ops-green border border-emerald-500/30" },
    pending: { label: "Pendiente", cls: "bg-amber-500/15 text-ops-amber border border-amber-500/30" },
    retrying: { label: "Reintentando", cls: "bg-amber-500/15 text-ops-amber border border-amber-500/30" },
    processing: { label: "Enviando", cls: "bg-blue-500/15 text-blue-400 border border-blue-500/30" },
    failed: { label: "Fallido", cls: "bg-red-500/15 text-ops-coral border border-red-500/30" },
    skipped: { label: "Omitido", cls: "bg-ops-sel/50 text-ops-tx3 border border-ops-bd/50" },
    cancelled: { label: "Cancelado", cls: "bg-ops-sel/50 text-ops-tx3 border border-ops-bd/50" },
  }
  const s = map[status] ?? { label: status, cls: "bg-ops-sel/50 text-ops-tx2 border border-ops-bd/50" }
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}

function EventBadge({ eventName }: { eventName: string }) {
  const map: Record<string, string> = {
    Purchase: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
    Lead: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    Contact: "bg-teal-500/15 text-teal-400 border border-teal-500/30",
  }
  const cls = map[eventName] ?? "bg-ops-sel/50 text-ops-tx2 border border-ops-bd/50"
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {eventName}
    </span>
  )
}

export function CapiLogPanel({ clientId }: Props) {
  const [events, setEvents] = useState<ClientMetaEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryPending, startRetry] = useTransition()
  const [refreshPending, startRefresh] = useTransition()
  const [retryCount, setRetryCount] = useState<number | null>(null)

  async function loadEvents() {
    setLoading(true)
    setError(null)
    try {
      const result = await getClientMetaEventsAction(clientId, 50)
      if ("error" in result) {
        setError(result.error)
      } else {
        setEvents(result.data)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  function handleRefresh() {
    startRefresh(async () => {
      await loadEvents()
    })
  }

  function handleRetryAll() {
    startRetry(async () => {
      const result = await retryFailedCapiForClientAction(clientId)
      if ("success" in result) {
        setRetryCount(result.count)
        await loadEvents()
      }
    })
  }

  const failedCount = events.filter((e) => e.status === "failed").length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-ops-tx2" />
          <h2 className="text-base font-semibold text-ops-tx">Eventos CAPI</h2>
          {events.length > 0 && (
            <span className="text-xs text-ops-tx3">({events.length})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {failedCount > 0 && (
            <button
              onClick={handleRetryAll}
              disabled={retryPending || loading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-ops-amber transition-colors disabled:opacity-50"
            >
              {retryPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Reintentar fallidos ({failedCount})
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading || refreshPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-ops-s2 hover:bg-ops-sel text-ops-tx2 transition-colors disabled:opacity-50"
          >
            {refreshPending || loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Actualizar
          </button>
        </div>
      </div>

      {retryCount !== null && (
        <div className="text-xs text-ops-amber bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          {retryCount === 0
            ? "No hay eventos fallidos reintentables (puede que tengan errores de token permanentes)"
            : `Se pusieron ${retryCount} eventos a la cola para reintento`}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-ops-coral bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && events.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-ops-tx3">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-ops-line rounded-lg">
          <Zap className="h-8 w-8 text-ops-tx3 mb-3" />
          <p className="text-ops-tx3 text-sm font-medium">Sin eventos CAPI aún</p>
          <p className="text-ops-tx3 text-xs mt-1">
            Los eventos aparecerán aquí cuando se registren ventas, leads o contactos.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((evt) => (
            <div
              key={evt.id}
              className="rounded-lg bg-ops-s1 border border-ops-line px-4 py-3 space-y-1.5"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <StatusPill status={evt.status} />
                <EventBadge eventName={evt.eventName} />
                <span className="text-sm text-ops-tx truncate flex-1 min-w-0">
                  {evt.leadName ?? <span className="text-ops-tx3">—</span>}
                </span>
                {evt.attemptCount > 0 && (
                  <span className="text-xs text-ops-tx3 font-mono">×{evt.attemptCount}</span>
                )}
                <span className="text-xs text-ops-tx3 ml-auto whitespace-nowrap">
                  {formatRelativeTime(evt.createdAt)}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-ops-tx3 pl-0.5 flex-wrap">
                <span className="font-mono">
                  {evt.pixelId.slice(0, 8)}…
                </span>
                {evt.conversionAmount && evt.conversionCurrency && (
                  <span className="text-ops-tx2">
                    {evt.conversionAmount} {evt.conversionCurrency}
                  </span>
                )}
              </div>

              {evt.lastError && evt.status !== "sent" && (
                <div className="flex items-start gap-1.5 text-xs text-ops-coral/80 pl-0.5">
                  <AlertCircle className="h-3 w-3 flex-shrink-0 mt-px" />
                  <span className="truncate">{evt.lastError.slice(0, 120)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

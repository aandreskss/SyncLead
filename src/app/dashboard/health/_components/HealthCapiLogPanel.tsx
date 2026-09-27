"use client"

import { useState, useEffect, useTransition } from "react"
import { Zap, RefreshCw, Loader2, AlertCircle } from "lucide-react"
import {
  getOrgMetaEventsAction,
  retryFailedCapiEventsAction,
  retryFailedCapiForClientAction,
} from "@/domains/health/actions"
import type { ClientMetaEventRow } from "@/domains/health/repository"

interface Props {
  clientId?: string
}

type StatusFilter = "all" | "pending" | "failed" | "sent"

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
    AddToCart: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30",
    InitiateCheckout: "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30",
    ViewContent: "bg-slate-500/15 text-slate-400 border border-slate-500/30",
  }
  const cls = map[eventName] ?? "bg-ops-sel/50 text-ops-tx2 border border-ops-bd/50"
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {eventName}
    </span>
  )
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendientes" },
  { value: "failed", label: "Fallidos" },
  { value: "sent", label: "Enviados" },
]

function matchesFilter(evt: ClientMetaEventRow, filter: StatusFilter): boolean {
  if (filter === "all") return true
  if (filter === "pending") return evt.status === "pending" || evt.status === "retrying" || evt.status === "processing"
  if (filter === "failed") return evt.status === "failed"
  if (filter === "sent") return evt.status === "sent"
  return true
}

export function HealthCapiLogPanel({ clientId }: Props) {
  const [allEvents, setAllEvents] = useState<ClientMetaEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [retryPending, startRetry] = useTransition()
  const [retryMessage, setRetryMessage] = useState<string | null>(null)

  async function loadEvents() {
    setLoading(true)
    setError(null)
    try {
      const result = await getOrgMetaEventsAction(clientId, 150)
      if ("error" in result) {
        setError(result.error)
      } else {
        setAllEvents(result.data)
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

  function handleRetryFailed() {
    startRetry(async () => {
      setRetryMessage(null)
      const result = clientId
        ? await retryFailedCapiForClientAction(clientId)
        : await retryFailedCapiEventsAction()
      if ("success" in result) {
        setRetryMessage(
          result.count === 0
            ? "No hay fallidos reintentables (pueden tener errores de token permanentes)"
            : `${result.count} evento(s) puestos a la cola para reintento`
        )
        await loadEvents()
      }
    })
  }

  const events = allEvents.filter((e) => matchesFilter(e, statusFilter))
  const failedCount = allEvents.filter((e) => e.status === "failed").length
  const pendingCount = allEvents.filter((e) => e.status === "pending" || e.status === "retrying").length

  const counts: Record<StatusFilter, number> = {
    all: allEvents.length,
    pending: allEvents.filter((e) => e.status === "pending" || e.status === "retrying" || e.status === "processing").length,
    failed: failedCount,
    sent: allEvents.filter((e) => e.status === "sent").length,
  }

  return (
    <div className="rounded-lg border border-ops-line bg-ops-s1">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 border-b border-ops-line">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-ops-tx2" aria-hidden />
          <h2 className="text-sm font-semibold text-ops-tx">Historial de eventos CAPI</h2>
          {!loading && (
            <span className="text-xs text-ops-tx3">
              ({allEvents.length} eventos)
              {pendingCount > 0 && <span className="ml-1 text-ops-amber">· {pendingCount} pendientes</span>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {failedCount > 0 && (
            <button
              onClick={handleRetryFailed}
              disabled={retryPending || loading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-ops-amber transition-colors disabled:opacity-50"
            >
              {retryPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Reintentar fallidos ({failedCount})
            </button>
          )}
          <button
            onClick={() => loadEvents()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-ops-s2 hover:bg-ops-sel text-ops-tx2 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Actualizar
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-ops-line">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`flex items-center gap-1 text-xs px-3 py-1 rounded-md transition-colors ${
              statusFilter === f.value
                ? "bg-ops-sel text-ops-tx font-medium"
                : "text-ops-tx2 hover:bg-ops-s2"
            }`}
          >
            {f.label}
            {counts[f.value] > 0 && (
              <span className={`font-mono ${statusFilter === f.value ? "text-ops-tx3" : "text-ops-tx3"}`}>
                {counts[f.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Messages */}
      {retryMessage && (
        <div className="mx-4 mt-3 text-xs text-ops-amber bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          {retryMessage}
        </div>
      )}
      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 text-xs text-ops-coral bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Events list */}
      <div className="px-4 py-3">
        {loading && allEvents.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-ops-tx3">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-ops-line rounded-lg">
            <Zap className="h-7 w-7 text-ops-tx3 mb-2" />
            <p className="text-ops-tx3 text-sm font-medium">
              {allEvents.length === 0 ? "Sin eventos CAPI aún" : "Sin eventos en este filtro"}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {events.map((evt) => (
              <div
                key={evt.id}
                className="rounded-lg bg-ops-s2 border border-ops-line px-4 py-3 space-y-1.5"
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
                  <span className="text-xs text-ops-tx3 whitespace-nowrap">
                    {formatRelativeTime(evt.createdAt)}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-ops-tx3 pl-0.5 flex-wrap">
                  <span className="font-mono">{evt.pixelId.slice(0, 8)}…</span>
                  {evt.conversionAmount && evt.conversionCurrency && (
                    <span className="text-ops-tx2">
                      {evt.conversionAmount} {evt.conversionCurrency}
                    </span>
                  )}
                </div>

                {evt.lastError && evt.status !== "sent" && (
                  <div className="flex items-start gap-1.5 text-xs text-ops-coral/80 pl-0.5">
                    <AlertCircle className="h-3 w-3 flex-shrink-0 mt-px" />
                    <span className="truncate">{evt.lastError.slice(0, 140)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

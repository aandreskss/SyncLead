"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { getLiveEventsAction, type LiveEvent } from "@/domains/tracking/actions"
import { Badge } from "@/components/ui/badge"
import { Radio, CheckCircle2, AlertCircle, Monitor, Globe, Zap, Wifi, WifiOff } from "lucide-react"

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return ""
  const base = 0x1F1E6 - 0x41
  return String.fromCodePoint(
    base + code.toUpperCase().charCodeAt(0),
    base + code.toUpperCase().charCodeAt(1)
  )
}

const POLL_INTERVAL_MS = 4000

const SOURCE_CONFIG = {
  browser_pixel: { label: "Pixel", icon: Globe, cls: "text-blue-400 bg-blue-400/10 border-blue-800" },
  server_capi: { label: "CAPI", icon: Monitor, cls: "text-purple-400 bg-purple-400/10 border-purple-800" },
  diagnostic_collector: { label: "Simulado", icon: Zap, cls: "text-ops-amber bg-amber-400/10 border-amber-800" },
  scan: { label: "Scan", icon: Radio, cls: "text-ops-tx2 bg-ops-s2 border-ops-bd" },
}

function formatRelative(date: Date): string {
  const d = date instanceof Date ? date : new Date(date)
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diffSec < 5) return "ahora"
  if (diffSec < 60) return `hace ${diffSec}s`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `hace ${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `hace ${diffH}h`
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })
}

function SourceBadge({ source }: { source: LiveEvent["source"] }) {
  const cfg = SOURCE_CONFIG[source] ?? SOURCE_CONFIG.scan
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

function EventRow({ event, isNew }: { event: LiveEvent; isNew: boolean }) {
  return (
    <li
      className={`flex items-start gap-3 px-4 py-3 transition-colors duration-1000 ${
        isNew ? "bg-ops-s2/80" : "hover:bg-ops-s2/30"
      }`}
    >
      <div className="mt-0.5 shrink-0">
        {event.allParamsOk ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <AlertCircle className="h-4 w-4 text-ops-amber" />
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ops-tx truncate">
            {event.definitionDisplayName ?? event.eventName}
          </span>
          <span className="text-xs text-ops-tx3 font-mono">{event.eventName}</span>
          <SourceBadge source={event.source} />
          {event.environment !== "production" && (
            <Badge className="text-xs bg-ops-s2 text-ops-tx2 border-ops-bd">
              {event.environment}
            </Badge>
          )}
        </div>

        <div className="space-y-0.5">
          {event.pageUrl && (
            <div className="flex items-center gap-2 text-xs text-ops-tx3">
              <a
                href={event.pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate hover:text-ops-tx hover:underline"
                title={event.pageUrl}
              >
                {event.pageUrl}
              </a>
              {(event.visitorCity || event.visitorCountry) && (
                <span className="shrink-0 flex items-center gap-1">
                  {event.visitorCountry && (
                    <span>{countryFlag(event.visitorCountry)}</span>
                  )}
                  <span>
                    {[event.visitorCity, event.visitorCountry].filter(Boolean).join(", ")}
                  </span>
                </span>
              )}
            </div>
          )}
          {!event.pageUrl && (event.visitorCity || event.visitorCountry) && (
            <div className="text-xs text-ops-tx3 flex items-center gap-1">
              {event.visitorCountry && <span>{countryFlag(event.visitorCountry)}</span>}
              <span>{[event.visitorCity, event.visitorCountry].filter(Boolean).join(", ")}</span>
            </div>
          )}
          {event.missingParams.length > 0 && (
            <div className="text-xs text-ops-amber">
              Faltan: {event.missingParams.join(", ")}
            </div>
          )}
        </div>
      </div>

      <span className="shrink-0 text-xs text-ops-tx3 tabular-nums">
        {formatRelative(event.observedAt)}
      </span>
    </li>
  )
}

type Props = {
  clientId: string
}

export function LiveEventFeed({ clientId }: Props) {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [connected, setConnected] = useState(true)
  const [loading, setLoading] = useState(true)
  const seenIds = useRef<Set<string>>(new Set())

  const fetchEvents = useCallback(async () => {
    const result = await getLiveEventsAction(clientId)
    if (result.error) {
      setConnected(false)
      return
    }
    setConnected(true)
    const incoming = result.data ?? []

    const arrivedNew = incoming
      .filter((e) => !seenIds.current.has(e.id))
      .map((e) => e.id)

    if (arrivedNew.length > 0) {
      arrivedNew.forEach((id) => seenIds.current.add(id))
      setNewIds(new Set(arrivedNew))
      // Clear highlight after 3s
      setTimeout(() => setNewIds(new Set()), 3000)
    }

    // Mark all current IDs as seen on first load
    if (seenIds.current.size === 0) {
      incoming.forEach((e) => seenIds.current.add(e.id))
    }

    setEvents(incoming)
    setLoading(false)
  }, [clientId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEvents()
    const interval = setInterval(fetchEvents, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchEvents])

  return (
    <div className="rounded-lg border border-ops-line bg-ops-s1">
      <div className="flex items-center gap-2 border-b border-ops-line px-4 py-3">
        <Radio className="h-4 w-4 text-ops-tx2" />
        <h3 className="text-sm font-medium text-ops-tx">Feed de eventos</h3>
        <div className="ml-auto flex items-center gap-2">
          {connected ? (
            <span className="flex items-center gap-1.5 text-xs text-ops-green">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              En vivo
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-ops-coral">
              <WifiOff className="h-3.5 w-3.5" />
              Sin conexión
            </span>
          )}
          <span className="text-xs text-ops-tx3">
            {connected && <Wifi className="h-3.5 w-3.5 inline" />}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-ops-tx3">
          Cargando eventos...
        </div>
      ) : events.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <Radio className="h-6 w-6 text-ops-tx3 mx-auto mb-2" />
          <p className="text-sm text-ops-tx3">Sin eventos aún</p>
          <p className="text-xs text-ops-tx3 mt-1">
            Usa <span className="text-ops-tx2">⚡ Simular</span> o dispara un evento desde tu sitio
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-ops-line/50 max-h-[480px] overflow-y-auto">
          {events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              isNew={newIds.has(event.id)}
            />
          ))}
        </ul>
      )}

      <div className="border-t border-ops-line px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-ops-tx3">{events.length} evento{events.length !== 1 ? "s" : ""} · últimos 90 días</span>
        <span className="text-xs text-ops-tx3">Actualiza cada {POLL_INTERVAL_MS / 1000}s</span>
      </div>
    </div>
  )
}

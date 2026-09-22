import Link from "next/link"
import { notFound } from "next/navigation"
import { requireClientAccess } from "@/lib/auth/server"
import { getObservationsByVisitor } from "@/domains/tracking/repository"
import { ArrowLeft } from "lucide-react"
import type { ConversionObservation } from "@/lib/db/schema"

type SourceInfo = { label: string; cls: string }

function resolveSource(utmSource: string | null, referrer: string | null): SourceInfo {
  const src = (utmSource ?? "").toLowerCase()
  const ref = (referrer ?? "").toLowerCase()
  if (src.includes("google") || ref.includes("google.com"))
    return { label: "Google", cls: "text-blue-400 bg-blue-400/10 border-blue-800" }
  if (src.includes("facebook") || src.includes("fb") || ref.includes("facebook.com"))
    return { label: "Facebook", cls: "text-blue-300 bg-blue-300/10 border-blue-700" }
  if (src.includes("instagram") || ref.includes("instagram.com"))
    return { label: "Instagram", cls: "text-pink-400 bg-pink-400/10 border-pink-800" }
  if (src.includes("tiktok") || ref.includes("tiktok.com"))
    return { label: "TikTok", cls: "text-ops-tx2 bg-ops-s2 border-ops-bd" }
  if (src.includes("whatsapp") || ref.includes("whatsapp.com") || ref.includes("wa.me"))
    return { label: "WhatsApp", cls: "text-emerald-400 bg-emerald-400/10 border-emerald-800" }
  if (utmSource)
    return { label: utmSource, cls: "text-ops-tx2 bg-ops-s2 border-ops-bd" }
  if (referrer) {
    let host = referrer
    try { host = new URL(referrer).hostname.replace(/^www\./, "") } catch { /* invalid */ }
    return { label: host, cls: "text-ops-tx2 bg-ops-s2 border-ops-bd" }
  }
  return { label: "Directo", cls: "text-ops-tx3 bg-ops-s2 border-ops-bd" }
}

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return ""
  const base = 0x1f1e6 - 0x41
  return String.fromCodePoint(
    base + code.toUpperCase().charCodeAt(0),
    base + code.toUpperCase().charCodeAt(1),
  )
}

function groupByDate(events: ConversionObservation[]): Array<{ date: string; events: ConversionObservation[] }> {
  const map = new Map<string, ConversionObservation[]>()
  for (const e of events) {
    const key = e.observedAt.toLocaleDateString("es-ES", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    })
    const existing = map.get(key)
    if (existing) existing.push(e)
    else map.set(key, [e])
  }
  return Array.from(map.entries()).map(([date, evts]) => ({ date, events: evts }))
}

const EVENT_DOTS: Record<string, string> = {
  PageView: "#6B7280",
  Lead: "#3B82F6",
  Purchase: "#10B981",
  AddToCart: "#F59E0B",
  InitiateCheckout: "#F97316",
  ViewContent: "#0EA5E9",
  Contact: "#8B5CF6",
  Schedule: "#EC4899",
  CompleteRegistration: "#22C55E",
}

export default async function VisitorDetailPage({
  params,
}: {
  params: Promise<{ id: string; visitorId: string }>
}) {
  const { id: clientId, visitorId } = await params

  let ctx: Awaited<ReturnType<typeof requireClientAccess>>
  try {
    ctx = await requireClientAccess(clientId)
  } catch {
    notFound()
  }

  const events = await getObservationsByVisitor(ctx.orgId, clientId, visitorId)
  if (events.length === 0) notFound()

  const first = events[0]
  const last = events[events.length - 1]
  const source = resolveSource(first.utmSource, first.referrer)
  const hasAttribution = first.utmSource || first.utmMedium || first.utmCampaign || first.referrer

  const groups = groupByDate(events)

  return (
    <div className="min-h-screen bg-ops-bg p-6 space-y-5">
      {/* Back */}
      <Link
        href={`/dashboard/clients/${clientId}/tracking/visitors`}
        className="inline-flex items-center gap-1.5 text-sm text-ops-tx3 hover:text-ops-tx transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Visitantes
      </Link>

      {/* Header card */}
      <div className="rounded-lg border border-ops-line bg-ops-s1 p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-md bg-ops-blue/10 px-3 py-1.5 font-mono text-sm font-semibold text-ops-blue">
            #{visitorId.slice(0, 8)}
          </span>
          <span className={`inline-flex rounded border px-2.5 py-1 text-xs font-semibold ${source.cls}`}>
            {source.label}
          </span>
          {(first.visitorCity || first.visitorCountry) && (
            <span className="text-sm text-ops-tx2">
              {first.visitorCountry && countryFlag(first.visitorCountry)}{" "}
              {[first.visitorCity, first.visitorCountry].filter(Boolean).join(", ")}
            </span>
          )}
        </div>

        <p className="mt-2 font-mono text-[11px] text-ops-tx3 break-all">{visitorId}</p>

        <div className="mt-4 flex gap-6 flex-wrap">
          <div>
            <p className="text-xs text-ops-tx3">Eventos</p>
            <p className="text-xl font-bold text-ops-tx">{events.length}</p>
          </div>
          <div>
            <p className="text-xs text-ops-tx3">Primera visita</p>
            <p className="text-sm font-medium text-ops-tx2">
              {first.observedAt.toLocaleDateString("es-ES", {
                day: "2-digit", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          </div>
          <div>
            <p className="text-xs text-ops-tx3">Última actividad</p>
            <p className="text-sm font-medium text-ops-tx2">
              {last.observedAt.toLocaleDateString("es-ES", {
                day: "2-digit", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Attribution */}
      <div className="rounded-lg border border-ops-line bg-ops-s1 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-ops-tx3 mb-3">Atribución</p>
        {hasAttribution ? (
          <div className="flex gap-2 flex-wrap">
            {first.utmSource && (
              <span className="rounded-full border border-ops-bd bg-ops-s2 px-3 py-1 text-xs text-ops-tx2">
                <span className="text-ops-tx3">Fuente: </span>{first.utmSource}
              </span>
            )}
            {first.utmMedium && (
              <span className="rounded-full border border-ops-bd bg-ops-s2 px-3 py-1 text-xs text-ops-tx2">
                <span className="text-ops-tx3">Medio: </span>{first.utmMedium}
              </span>
            )}
            {first.utmCampaign && (
              <span className="rounded-full border border-ops-bd bg-ops-s2 px-3 py-1 text-xs text-ops-tx2">
                <span className="text-ops-tx3">Campaña: </span>{first.utmCampaign}
              </span>
            )}
            {first.referrer && (
              <span className="rounded-full border border-ops-bd bg-ops-s2 px-3 py-1 text-xs text-ops-tx2 max-w-xs truncate">
                <span className="text-ops-tx3">Referrer: </span>{first.referrer}
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-ops-tx3">Tráfico directo</p>
        )}
      </div>

      {/* Timeline */}
      <div className="rounded-lg border border-ops-line bg-ops-s1 overflow-hidden">
        <div className="border-b border-ops-line px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ops-tx3">
            Recorrido del visitante
          </p>
        </div>
        <div className="p-5 space-y-6">
          {groups.map(({ date, events: dayEvents }) => (
            <div key={date}>
              <p className="capitalize text-xs font-semibold text-ops-tx3 mb-3 border-b border-ops-line pb-2">
                {date}
              </p>
              <div className="space-y-1">
                {dayEvents.map((event) => {
                  const dot = EVENT_DOTS[event.eventName] ?? "#6B7280"
                  const params = event.parametersPresent as Record<string, boolean>
                  const presentParams = Object.keys(params).filter((k) => params[k])
                  return (
                    <div key={event.id} className="flex items-start gap-3 py-1.5">
                      <div
                        className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: dot }}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-ops-tx">{event.eventName}</span>
                        {event.pageUrl && (
                          <span className="ml-2 text-xs text-ops-tx3 truncate max-w-sm inline-block align-middle">
                            {event.pageUrl}
                          </span>
                        )}
                        {presentParams.length > 0 && (
                          <div className="mt-0.5 flex gap-1 flex-wrap">
                            {presentParams.map((p) => (
                              <span key={p} className="text-[10px] rounded border border-emerald-800 bg-emerald-900/20 px-1.5 py-0.5 text-emerald-400">
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 font-mono text-xs text-ops-tx3">
                        {event.observedAt.toLocaleTimeString("es-ES", {
                          hour: "2-digit", minute: "2-digit", second: "2-digit",
                        })}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

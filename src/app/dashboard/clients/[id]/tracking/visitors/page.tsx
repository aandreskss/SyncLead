import Link from "next/link"
import { notFound } from "next/navigation"
import { requireClientAccess } from "@/lib/auth/server"
import { getVisitorSessionsByClient, type VisitorSessionRow } from "@/domains/tracking/repository"
import { Users, ArrowLeft } from "lucide-react"

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

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "ahora"
  if (diffMin < 60) return `hace ${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `hace ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  return `hace ${diffD}d`
}

export default async function VisitorsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: clientId } = await params

  let ctx: Awaited<ReturnType<typeof requireClientAccess>>
  try {
    ctx = await requireClientAccess(clientId)
  } catch {
    notFound()
  }

  const sessions = await getVisitorSessionsByClient(ctx.orgId, clientId)

  // Source breakdown stats
  const sourceMap = new Map<string, number>()
  for (const s of sessions) {
    const info = resolveSource(s.utmSource, s.referrer)
    sourceMap.set(info.label, (sourceMap.get(info.label) ?? 0) + 1)
  }
  const topSources = Array.from(sourceMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  return (
    <div className="min-h-screen bg-ops-bg p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/dashboard/clients/${clientId}/tracking`}
          className="flex items-center gap-1.5 text-sm text-ops-tx3 hover:text-ops-tx transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Diagnóstico
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ops-blue/10">
            <Users className="h-5 w-5 text-ops-blue" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ops-tx">Visitantes de Facebook</h1>
            <p className="text-sm text-ops-tx3">Recorridos de visitantes provenientes de campañas · últimos 30 días</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-ops-line bg-ops-s1 p-4">
          <p className="text-xs text-ops-tx3 mb-1">Visitantes únicos</p>
          <p className="text-2xl font-bold text-ops-tx">{sessions.length}</p>
        </div>
        {topSources.map(([label, count]) => {
          const info = resolveSource(
            sessions.find((s) => resolveSource(s.utmSource, s.referrer).label === label)?.utmSource ?? null,
            sessions.find((s) => resolveSource(s.utmSource, s.referrer).label === label)?.referrer ?? null,
          )
          return (
            <div key={label} className="rounded-lg border border-ops-line bg-ops-s1 p-4">
              <p className="text-xs text-ops-tx3 mb-1">
                <span className={`inline rounded border px-1.5 py-0.5 text-xs font-medium ${info.cls}`}>
                  {label}
                </span>
              </p>
              <p className="text-2xl font-bold text-ops-tx">{count}</p>
              <p className="text-xs text-ops-tx3">
                {sessions.length > 0 ? `${Math.round((count / sessions.length) * 100)}%` : "—"}
              </p>
            </div>
          )
        })}
      </div>

      {/* Session list */}
      <div className="rounded-lg border border-ops-line bg-ops-s1 overflow-hidden">
        <div className="border-b border-ops-line px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ops-tx3">
            Sesiones recientes
          </p>
        </div>

        {sessions.length === 0 ? (
          <div className="px-4 py-16 text-center space-y-3">
            <Users className="h-8 w-8 text-ops-tx3 mx-auto" />
            <p className="text-sm text-ops-tx3">Sin visitantes aún</p>
            <div className="max-w-sm mx-auto rounded-lg border border-ops-bd bg-ops-s2 px-4 py-3 text-left space-y-1.5">
              <p className="text-xs font-semibold text-ops-tx2">Solo aparecen visitantes de campañas de Facebook</p>
              <p className="text-xs text-ops-tx3">
                El feed en vivo muestra todos los visitantes (orgánico, directo, paid).
                Esta sección filtra solo los que llegaron vía Facebook Ads — identificados por
                fbclid, cookie <code className="text-ops-tx2">_fbc</code>, o <code className="text-ops-tx2">utm_source=facebook</code>.
              </p>
              <p className="text-xs text-ops-tx3">
                Si no aparece nadie, verifica que el script de instalación esté activo en el sitio del cliente
                y que haya tráfico de campañas de Facebook en los últimos 30 días.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-ops-line/50">
            {sessions.map((session) => {
              const src = resolveSource(session.utmSource, session.referrer)
              return (
                <li key={session.visitorId}>
                  <Link
                    href={`/dashboard/clients/${clientId}/tracking/visitors/${session.visitorId}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-ops-s2/50 transition-colors"
                  >
                    {/* Short ID */}
                    <span className="shrink-0 rounded-md bg-ops-blue/10 px-2 py-1 font-mono text-xs font-semibold text-ops-blue">
                      #{session.visitorId.slice(0, 8)}
                    </span>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-ops-tx">{session.firstEventName}</span>
                        <span className={`inline rounded border px-1.5 py-0.5 text-xs font-medium ${src.cls}`}>
                          {src.label}
                        </span>
                      </div>
                      <p className="text-xs text-ops-tx3">
                        {session.eventCount} evento{session.eventCount !== 1 ? "s" : ""}
                        {session.utmCampaign ? ` · ${session.utmCampaign}` : ""}
                        {(session.visitorCity || session.visitorCountry) && (
                          <>
                            {" · "}
                            {session.visitorCountry && countryFlag(session.visitorCountry)}{" "}
                            {[session.visitorCity, session.visitorCountry].filter(Boolean).join(", ")}
                          </>
                        )}
                      </p>
                    </div>

                    {/* Time */}
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-medium text-ops-tx2">{relativeTime(session.lastSeen)}</p>
                      <p className="text-[10px] text-ops-tx3">
                        {session.firstSeen.toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    <svg className="shrink-0 h-4 w-4 text-ops-tx3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

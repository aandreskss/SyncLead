import Link from "next/link"
import { notFound } from "next/navigation"
import { requireClientAccess } from "@/lib/auth/server"
import { getVisitorSessionsByClient, type VisitorSessionRow } from "@/domains/tracking/repository"
import { Users, ArrowLeft, ShoppingCart, CreditCard, Eye, Activity } from "lucide-react"

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

function formatDuration(ms: number): string {
  if (ms < 30000) return "< 30s"
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min === 0) return `${sec}s`
  if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60}m`
  if (sec === 0) return `${min}m`
  return `${min}m ${sec}s`
}

function applyActionFilter(sessions: VisitorSessionRow[], action: string): VisitorSessionRow[] {
  switch (action) {
    case "checkout": return sessions.filter((s) => s.hasCheckout)
    case "cart":     return sessions.filter((s) => s.hasAddToCart)
    case "product":  return sessions.filter((s) => s.hasViewProduct)
    case "passive":  return sessions.filter((s) => !s.hasCheckout && !s.hasAddToCart && !s.hasViewProduct)
    default:         return sessions
  }
}

function buildUrl(clientId: string, action: string, days: string): string {
  return `/dashboard/clients/${clientId}/tracking/visitors?action=${action}&days=${days}`
}

export default async function VisitorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ action?: string; days?: string }>
}) {
  const { id: clientId } = await params
  const sp = await searchParams
  const currentAction = sp.action ?? "all"
  const currentDays = sp.days ?? "30"
  const daysNum = currentDays === "7" ? 7 : currentDays === "90" ? 90 : 30

  let ctx: Awaited<ReturnType<typeof requireClientAccess>>
  try {
    ctx = await requireClientAccess(clientId)
  } catch {
    notFound()
  }

  const allSessions = await getVisitorSessionsByClient(ctx.orgId, clientId, 200, daysNum)
  const sessions = applyActionFilter(allSessions, currentAction)

  // Source breakdown stats
  const sourceMap = new Map<string, number>()
  for (const s of allSessions) {
    const info = resolveSource(s.utmSource, s.referrer)
    sourceMap.set(info.label, (sourceMap.get(info.label) ?? 0) + 1)
  }
  const topSources = Array.from(sourceMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  // Action counts for filter badges
  const counts = {
    all:      allSessions.length,
    checkout: allSessions.filter((s) => s.hasCheckout).length,
    cart:     allSessions.filter((s) => s.hasAddToCart).length,
    product:  allSessions.filter((s) => s.hasViewProduct).length,
    passive:  allSessions.filter((s) => !s.hasCheckout && !s.hasAddToCart && !s.hasViewProduct).length,
  }

  const ACTION_FILTERS = [
    { key: "all",      label: "Todos",           icon: null,          count: counts.all },
    { key: "checkout", label: "Con checkout",     icon: CreditCard,    count: counts.checkout },
    { key: "cart",     label: "Con carrito",      icon: ShoppingCart,  count: counts.cart },
    { key: "product",  label: "Vio productos",    icon: Eye,           count: counts.product },
    { key: "passive",  label: "Solo navegación",  icon: Activity,      count: counts.passive },
  ]

  const DAYS_FILTERS = ["7", "30", "90"]

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

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ops-blue/10">
            <Users className="h-5 w-5 text-ops-blue" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ops-tx">Visitantes de Meta</h1>
            <p className="text-sm text-ops-tx3">Campañas de Facebook, Instagram y WhatsApp · últimos {daysNum} días</p>
          </div>
        </div>

        {/* Days filter */}
        <div className="flex items-center gap-1 rounded-lg border border-ops-line bg-ops-s1 p-1">
          {DAYS_FILTERS.map((d) => (
            <Link
              key={d}
              href={buildUrl(clientId, currentAction, d)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                currentDays === d
                  ? "bg-ops-sel text-ops-tx"
                  : "text-ops-tx3 hover:text-ops-tx2"
              }`}
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-ops-line bg-ops-s1 p-4">
          <p className="text-xs text-ops-tx3 mb-1">Visitantes únicos</p>
          <p className="text-2xl font-bold text-ops-tx">{allSessions.length}</p>
        </div>
        {topSources.map(([label, count]) => {
          const info = resolveSource(
            allSessions.find((s) => resolveSource(s.utmSource, s.referrer).label === label)?.utmSource ?? null,
            allSessions.find((s) => resolveSource(s.utmSource, s.referrer).label === label)?.referrer ?? null,
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
                {allSessions.length > 0 ? `${Math.round((count / allSessions.length) * 100)}%` : "—"}
              </p>
            </div>
          )
        })}
      </div>

      {/* Action filters */}
      <div className="flex flex-wrap gap-2">
        {ACTION_FILTERS.map(({ key, label, icon: Icon, count }) => (
          <Link
            key={key}
            href={buildUrl(clientId, key, currentDays)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              currentAction === key
                ? "border-ops-blue bg-ops-blue/10 text-ops-blue"
                : "border-ops-line bg-ops-s1 text-ops-tx3 hover:text-ops-tx2 hover:border-ops-bd"
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {label}
            <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] ${
              currentAction === key ? "bg-ops-blue/20 text-ops-blue" : "bg-ops-s2 text-ops-tx3"
            }`}>
              {count}
            </span>
          </Link>
        ))}
      </div>

      {/* Session list */}
      <div className="rounded-lg border border-ops-line bg-ops-s1 overflow-hidden">
        <div className="border-b border-ops-line px-4 py-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-ops-tx3">
            Sesiones recientes
          </p>
          {currentAction !== "all" && (
            <p className="text-xs text-ops-tx3">{sessions.length} resultado{sessions.length !== 1 ? "s" : ""}</p>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="px-4 py-16 text-center space-y-3">
            <Users className="h-8 w-8 text-ops-tx3 mx-auto" />
            <p className="text-sm text-ops-tx3">
              {currentAction !== "all" ? "Ningún visitante coincide con este filtro" : "Sin visitantes aún"}
            </p>
            {currentAction === "all" && (
              <div className="max-w-sm mx-auto rounded-lg border border-ops-bd bg-ops-s2 px-4 py-3 text-left space-y-1.5">
                <p className="text-xs font-semibold text-ops-tx2">Solo aparecen visitantes de campañas de Meta</p>
                <p className="text-xs text-ops-tx3">
                  El feed muestra visitantes que llegaron vía Facebook, Instagram o WhatsApp Ads —
                  identificados por fbclid, cookie <code className="text-ops-tx2">_fbc</code>,
                  o <code className="text-ops-tx2">utm_source</code> con facebook / instagram / whatsapp.
                </p>
              </div>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-ops-line/50">
            {sessions.map((session) => {
              const src = resolveSource(session.utmSource, session.referrer)
              const duration = formatDuration(session.sessionDurationMs)
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
                        {/* Action badges */}
                        {session.hasCheckout && (
                          <span className="inline-flex items-center gap-0.5 rounded border border-orange-800 bg-orange-900/20 px-1.5 py-0.5 text-[10px] font-medium text-orange-400">
                            <CreditCard className="h-2.5 w-2.5" />checkout
                          </span>
                        )}
                        {session.hasAddToCart && !session.hasCheckout && (
                          <span className="inline-flex items-center gap-0.5 rounded border border-amber-800 bg-amber-900/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                            <ShoppingCart className="h-2.5 w-2.5" />carrito
                          </span>
                        )}
                        {session.hasViewProduct && !session.hasAddToCart && !session.hasCheckout && (
                          <span className="inline-flex items-center gap-0.5 rounded border border-sky-800 bg-sky-900/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
                            <Eye className="h-2.5 w-2.5" />producto
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ops-tx3">
                        {session.eventCount} evento{session.eventCount !== 1 ? "s" : ""}
                        {session.uniquePageCount > 1 ? ` · ${session.uniquePageCount} páginas` : ""}
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

                    {/* Duration + time */}
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold text-ops-tx2">{duration}</p>
                      <p className="text-[10px] text-ops-tx3">{relativeTime(session.lastSeen)}</p>
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

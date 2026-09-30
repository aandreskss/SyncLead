import Link from "next/link"
import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { getClientsByOrgId } from "@/domains/clients/repository"
import { getVisitorSessionsByClient, type VisitorSessionRow } from "@/domains/tracking/repository"
import { PageShell, PageHeader, KPICard, Panel, opsTable } from "@/components/app/ops"
import { Users, UserCheck, Link2, Clock, CreditCard, ShoppingCart, FileText, Info } from "lucide-react"

// ─── Utilities ────────────────────────────────────────────────────────────────

type SourceInfo = { label: string; cls: string }

function resolveSource(utmSource: string | null, referrer: string | null): SourceInfo {
  const src = (utmSource ?? "").toLowerCase()
  const ref = (referrer ?? "").toLowerCase()
  if (src.includes("facebook") || src.includes("fb") || ref.includes("facebook.com"))
    return { label: "Facebook", cls: "text-ops-blue bg-ops-blue/10 border-ops-blue/30" }
  if (src.includes("instagram") || ref.includes("instagram.com"))
    return { label: "Instagram", cls: "text-pink-400 bg-pink-400/10 border-pink-800" }
  if (src.includes("whatsapp") || ref.includes("whatsapp.com") || ref.includes("wa.me"))
    return { label: "WhatsApp", cls: "text-ops-green bg-ops-green/10 border-ops-green/30" }
  if (src.includes("google") || ref.includes("google.com"))
    return { label: "Google", cls: "text-ops-blue bg-ops-blue/10 border-ops-blue/30" }
  if (src.includes("tiktok") || ref.includes("tiktok.com"))
    return { label: "TikTok", cls: "text-ops-tx2 bg-ops-s2 border-ops-bd" }
  if (utmSource)
    return { label: utmSource, cls: "text-ops-tx2 bg-ops-s2 border-ops-bd" }
  if (referrer) {
    let host = referrer
    try { host = new URL(referrer).hostname.replace(/^www\./, "") } catch { /* invalid */ }
    return { label: host, cls: "text-ops-tx2 bg-ops-s2 border-ops-bd" }
  }
  return { label: "Directo", cls: "text-ops-tx3 bg-ops-s2 border-ops-bd" }
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

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function VisitorsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; days?: string }>
}) {
  let ctx: { orgId: string; userId: string }

  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    if (e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  const sp = await searchParams
  const clientId = sp.clientId || undefined
  const currentDays = sp.days ?? "30"
  const daysNum = currentDays === "7" ? 7 : currentDays === "90" ? 90 : 30

  const clients = await getClientsByOrgId(ctx.orgId)
  const selectedClient = clientId ? clients.find((c) => c.id === clientId) : null

  // Fetch sessions only when a client is selected
  const sessions: VisitorSessionRow[] = clientId
    ? await getVisitorSessionsByClient(ctx.orgId, clientId, 200, daysNum)
    : []

  // KPI calculations
  const uniqueVisitors = sessions.length
  const withInterest = sessions.filter(
    (s) => s.hasViewProduct || s.hasAddToCart || s.hasInfoRequest || s.hasCheckout
  ).length
  const linkedLeads = sessions.filter((s) => s.linkedLeadId !== null).length

  const durationsMs = sessions
    .map((s) => s.sessionDurationMs)
    .filter((ms) => ms > 0)
  const avgDurationMs =
    durationsMs.length > 0
      ? Math.round(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length)
      : 0

  // ─── Actions (days selector + client selector is built below) ────────────
  function buildHref(newClientId?: string, newDays?: string) {
    const p = new URLSearchParams()
    if (newClientId) p.set("clientId", newClientId)
    p.set("days", newDays ?? currentDays)
    return `/dashboard/visitors?${p}`
  }

  const DAYS_OPTIONS = ["7", "30", "90"] as const

  return (
    <PageShell>
      <PageHeader
        eyebrow="VISITANTES"
        title="Visitantes"
        subtitle="Sesiones de usuarios en tus landing pages provenientes de Meta Ads."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Days pills — only visible when a client is selected */}
            {clientId && (
              <div className="flex items-center gap-1 rounded-full border border-ops-line bg-ops-s1 p-0.5">
                {DAYS_OPTIONS.map((d) => (
                  <Link
                    key={d}
                    href={buildHref(clientId, d)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      currentDays === d
                        ? "bg-ops-sel text-ops-tx"
                        : "text-ops-tx3 hover:text-ops-tx2"
                    }`}
                  >
                    {d}d
                  </Link>
                ))}
              </div>
            )}

            {/* "Cambiar cliente" back link when client is selected */}
            {clientId && (
              <Link
                href="/dashboard/visitors"
                className="rounded-full border border-ops-bd bg-ops-s1 px-3 py-1.5 text-xs font-medium text-ops-tx2 hover:bg-ops-hover transition-colors"
              >
                Cambiar cliente
              </Link>
            )}
          </div>
        }
      />

      {/* ── No client selected: show client grid ────────────────────────── */}
      {!clientId && (
        <div className="space-y-4">
          {clients.length === 0 ? (
            <div className="rounded-[20px] border border-ops-line bg-ops-s1 shadow-ops-card px-6 py-16 text-center space-y-2">
              <p className="text-sm font-semibold text-ops-tx">Sin clientes aún</p>
              <p className="text-xs text-ops-tx3">
                Crea un cliente primero para ver sus visitantes de Meta.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-ops-tx3">
                Selecciona un cliente
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {clients.map((c) => (
                  <Link
                    key={c.id}
                    href={buildHref(c.id, "30")}
                    className="rounded-[20px] border border-ops-line bg-ops-s1 shadow-ops-card px-4 py-4 hover:bg-ops-hover transition-colors"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-ops-blue-bg mb-3">
                      <Users className="h-4 w-4 text-ops-blue" />
                    </div>
                    <p className="text-sm font-semibold text-ops-tx truncate">{c.name}</p>
                    <p className="text-xs text-ops-tx3 mt-0.5">Ver visitantes →</p>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Client selected ──────────────────────────────────────────────── */}
      {clientId && selectedClient && (
        <div className="space-y-5">
          {/* Client context label */}
          <p className="text-xs text-ops-tx3">
            {selectedClient.name} · últimos {daysNum} días
          </p>

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              label="Visitantes únicos"
              value={uniqueVisitors}
              icon={<Users className="h-5 w-5" />}
              tone="blue"
            />
            <KPICard
              label="Con intención"
              value={withInterest}
              sub={uniqueVisitors > 0 ? `${Math.round((withInterest / uniqueVisitors) * 100)}% del total` : undefined}
              icon={<UserCheck className="h-5 w-5" />}
              tone="amber"
            />
            <KPICard
              label="Leads vinculados"
              value={linkedLeads}
              sub={uniqueVisitors > 0 ? `${Math.round((linkedLeads / uniqueVisitors) * 100)}% conversión` : undefined}
              icon={<Link2 className="h-5 w-5" />}
              tone="green"
            />
            <KPICard
              label="Tiempo promedio"
              value={avgDurationMs > 0 ? formatDuration(avgDurationMs) : "—"}
              sub="por sesión"
              icon={<Clock className="h-5 w-5" />}
              tone="coral"
            />
          </div>

          {/* Sessions table */}
          <Panel
            title="Sesiones recientes"
            description={`${sessions.length} visitante${sessions.length !== 1 ? "s" : ""} de Meta Ads`}
            actions={
              <Link
                href={`/dashboard/clients/${clientId}/tracking/visitors`}
                className="rounded-full border border-ops-bd bg-ops-s1 px-3 py-1.5 text-xs font-medium text-ops-tx2 hover:bg-ops-hover transition-colors"
              >
                Ver todos →
              </Link>
            }
          >
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-ops-blue-bg text-ops-blue">
                  <Users className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-ops-tx">Sin visitantes en este periodo</p>
                <p className="max-w-xs text-xs text-ops-tx2">
                  Los visitantes aparecen cuando llegan vía Facebook, Instagram o WhatsApp Ads
                  con utm_source de Meta.
                </p>
              </div>
            ) : (
              <div className={opsTable.wrap}>
                <table className={opsTable.table}>
                  <thead>
                    <tr>
                      <th className={opsTable.th}>Fuente</th>
                      <th className={opsTable.th}>Páginas</th>
                      <th className={opsTable.th}>Señales</th>
                      <th className={opsTable.th}>Última visita</th>
                      <th className={opsTable.th}>Lead</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => {
                      const src = resolveSource(session.utmSource, session.referrer)
                      return (
                        <tr
                          key={session.visitorId}
                          className={opsTable.row}
                        >
                          {/* Fuente */}
                          <td className={opsTable.td}>
                            <Link
                              href={`/dashboard/clients/${clientId}/tracking/visitors/${session.visitorId}`}
                              className="flex items-center gap-2 group"
                            >
                              <span className="shrink-0 rounded-md bg-ops-blue/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-ops-blue">
                                #{session.visitorId.slice(0, 6)}
                              </span>
                              <span
                                className={`inline rounded border px-1.5 py-0.5 text-xs font-medium ${src.cls}`}
                              >
                                {src.label}
                              </span>
                              {session.utmCampaign && (
                                <span className="text-xs text-ops-tx3 truncate max-w-[120px]">
                                  {session.utmCampaign}
                                </span>
                              )}
                            </Link>
                          </td>

                          {/* Páginas */}
                          <td className={opsTable.td}>
                            <span className="text-sm text-ops-tx tabular-nums">
                              {session.uniquePageCount}
                            </span>
                            {session.sessionDurationMs > 0 && (
                              <span className="ml-1.5 text-xs text-ops-tx3">
                                · {formatDuration(session.sessionDurationMs)}
                              </span>
                            )}
                          </td>

                          {/* Señales */}
                          <td className={opsTable.td}>
                            <div className="flex flex-wrap gap-1">
                              {session.hasPurchase && (
                                <span className="inline-flex items-center rounded-full bg-ops-green-bg px-2 py-0.5 text-[10px] font-medium text-ops-green">
                                  Compra
                                </span>
                              )}
                              {session.hasCheckout && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-ops-amber-bg px-2 py-0.5 text-[10px] font-medium text-ops-amber">
                                  <CreditCard className="h-2.5 w-2.5" />
                                  Checkout
                                </span>
                              )}
                              {session.hasFormSubmit && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-ops-blue-bg px-2 py-0.5 text-[10px] font-medium text-ops-blue">
                                  <FileText className="h-2.5 w-2.5" />
                                  Formulario
                                </span>
                              )}
                              {session.hasAddToCart && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-ops-amber-bg px-2 py-0.5 text-[10px] font-medium text-ops-amber">
                                  <ShoppingCart className="h-2.5 w-2.5" />
                                  Carrito
                                </span>
                              )}
                              {session.hasInfoRequest && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-ops-blue-bg px-2 py-0.5 text-[10px] font-medium text-ops-blue">
                                  <Info className="h-2.5 w-2.5" />
                                  Info
                                </span>
                              )}
                              {!session.hasPurchase && !session.hasCheckout && !session.hasFormSubmit && !session.hasAddToCart && !session.hasInfoRequest && (
                                <span className="text-xs text-ops-tx3">—</span>
                              )}
                            </div>
                          </td>

                          {/* Última visita */}
                          <td className={opsTable.td}>
                            <span className="text-xs text-ops-tx2">
                              {relativeTime(session.lastSeen)}
                            </span>
                          </td>

                          {/* Lead vinculado */}
                          <td className={opsTable.td}>
                            {session.linkedLeadId && session.linkedCampaignId ? (
                              <Link
                                href={`/dashboard/campaigns/${session.linkedCampaignId}/leads?q=${encodeURIComponent(session.linkedLeadName ?? "")}`}
                                className="inline-flex items-center gap-1 rounded-full bg-ops-green-bg px-2 py-0.5 text-[11px] font-medium text-ops-green hover:opacity-80 transition-opacity"
                              >
                                {session.linkedLeadName ?? "Lead"} ↗
                              </Link>
                            ) : (
                              <span className="text-xs text-ops-tx3">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Link to full per-client page */}
          <div className="flex justify-center">
            <Link
              href={`/dashboard/clients/${clientId}/tracking/visitors`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ops-bd bg-ops-s1 px-4 py-2 text-sm font-medium text-ops-tx2 hover:bg-ops-hover transition-colors shadow-ops-card"
            >
              <Users className="h-4 w-4" />
              Ver todos los visitantes de {selectedClient.name}
            </Link>
          </div>
        </div>
      )}

      {/* Edge case: clientId in URL but not found (deleted client) */}
      {clientId && !selectedClient && (
        <div className="rounded-[20px] border border-ops-line bg-ops-s1 shadow-ops-card px-6 py-16 text-center space-y-2">
          <p className="text-sm font-semibold text-ops-tx">Cliente no encontrado</p>
          <p className="text-xs text-ops-tx3 mb-4">
            El cliente seleccionado no existe o no tienes acceso.
          </p>
          <Link
            href="/dashboard/visitors"
            className="inline-flex items-center gap-1.5 rounded-full border border-ops-bd bg-ops-s1 px-4 py-2 text-sm font-medium text-ops-tx2 hover:bg-ops-hover transition-colors"
          >
            Volver a Visitantes
          </Link>
        </div>
      )}
    </PageShell>
  )
}

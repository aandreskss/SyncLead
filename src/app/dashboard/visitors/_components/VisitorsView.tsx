"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Users, UserCheck, ShoppingCart, CreditCard, DollarSign, Eye,
  FileText, Info, Activity, Building2, ChevronDown, ChevronUp,
  ChevronRight, Globe, Layers, ScanEye,
} from "lucide-react"
import type { Client } from "@/lib/db/schema"
import type { VisitorSessionRow } from "@/domains/tracking/repository"
import { PageHeader } from "@/components/app/ops"
import { cn } from "@/lib/utils"

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Props {
  clients: Client[]
  sessions: VisitorSessionRow[]
  leadStats: { total: number; breakdown: { path: string; count: number }[] }
  currentClientId: string | undefined
  currentDays: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SourceInfo = { label: string; bg: string; text: string; border: string; key: string }

function resolveSource(utmSource: string | null, referrer: string | null): SourceInfo {
  const src = (utmSource ?? "").toLowerCase()
  const ref = (referrer ?? "").toLowerCase()
  if (src.includes("facebook") || src.includes("fb") || ref.includes("facebook.com"))
    return { label: "Facebook", bg: "bg-ops-blue-bg", text: "text-ops-blue", border: "border-ops-blue/30", key: "facebook" }
  if (src.includes("instagram") || ref.includes("instagram.com"))
    return { label: "Instagram", bg: "bg-pink-50", text: "text-pink-600", border: "border-pink-200", key: "instagram" }
  if (src.includes("whatsapp") || ref.includes("whatsapp.com") || ref.includes("wa.me"))
    return { label: "WhatsApp", bg: "bg-ops-green-bg", text: "text-ops-green", border: "border-ops-green/30", key: "whatsapp" }
  if (src.includes("google") || ref.includes("google.com"))
    return { label: "Google", bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200", key: "google" }
  if (src.includes("tiktok") || ref.includes("tiktok.com"))
    return { label: "TikTok", bg: "bg-ops-line", text: "text-ops-tx2", border: "border-ops-line", key: "tiktok" }
  if (utmSource)
    return { label: utmSource, bg: "bg-ops-s1", text: "text-ops-tx2", border: "border-ops-line", key: "other" }
  if (referrer) {
    let host = referrer
    try { host = new URL(referrer).hostname.replace(/^www\./, "") } catch { /* noop */ }
    return { label: host, bg: "bg-ops-s1", text: "text-ops-tx2", border: "border-ops-line", key: "other" }
  }
  return { label: "Directo", bg: "bg-ops-s1", text: "text-ops-tx3", border: "border-ops-line", key: "direct" }
}

function extractPath(url: string | null): string | null {
  if (!url) return null
  try { return new URL(url).pathname || "/" } catch { return url }
}

function relativeTime(date: Date): string {
  const ms = Date.now() - date.getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return "ahora"
  if (m < 60) return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

function formatDuration(ms: number): string {
  if (ms < 30000) return "< 30s"
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m === 0) return `${sec}s`
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return sec === 0 ? `${m}m` : `${m}m ${sec}s`
}

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return ""
  const b = 0x1f1e6 - 0x41
  return String.fromCodePoint(b + code.toUpperCase().charCodeAt(0), b + code.toUpperCase().charCodeAt(1))
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

type ActionKey =
  | "all" | "purchase" | "checkout" | "cart_abandoned"
  | "cart" | "lead" | "linked" | "product" | "info" | "passive"

function applySourceFilter(sessions: VisitorSessionRow[], source: string): VisitorSessionRow[] {
  if (source === "all") return sessions
  return sessions.filter((s) => resolveSource(s.utmSource, s.referrer).key === source)
}

function applyActionFilter(sessions: VisitorSessionRow[], action: ActionKey): VisitorSessionRow[] {
  switch (action) {
    case "purchase":      return sessions.filter((s) => s.hasPurchase)
    case "checkout":      return sessions.filter((s) => s.hasCheckout)
    case "cart_abandoned":return sessions.filter((s) => s.hasCheckout && !s.hasPurchase)
    case "cart":          return sessions.filter((s) => s.hasAddToCart)
    case "lead":          return sessions.filter((s) => s.hasFormSubmit)
    case "linked":        return sessions.filter((s) => s.linkedLeadId !== null)
    case "product":       return sessions.filter((s) => s.hasViewProduct)
    case "info":          return sessions.filter((s) => s.hasInfoRequest)
    case "passive":       return sessions.filter(
      (s) => !s.hasCheckout && !s.hasAddToCart && !s.hasViewProduct && !s.hasFormSubmit && !s.hasPurchase && !s.hasInfoRequest
    )
    default: return sessions
  }
}

function applyLandingFilter(sessions: VisitorSessionRow[], landing: string | undefined): VisitorSessionRow[] {
  if (!landing) return sessions
  if (landing === "__none__") return sessions.filter((s) => !s.firstPageUrl)
  return sessions.filter((s) => {
    if (!s.firstPageUrl) return false
    let p = "/"
    try { p = new URL(s.firstPageUrl).pathname || "/" } catch { p = s.firstPageUrl }
    return p === landing
  })
}

// ─── Sub-componentes pequeños ─────────────────────────────────────────────────

function StatItem({ value, label, color = "default" }: { value: number | string; label: string; color?: "default" | "green" | "neutral" | "blue" | "coral" | "amber" }) {
  const cls = { default: "text-ops-tx", green: "text-ops-green", neutral: "text-ops-tx2", blue: "text-ops-blue", coral: "text-ops-coral", amber: "text-ops-amber" }[color]
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("font-plex text-xl font-bold tabular-nums", cls)}>{value}</span>
      <span className="text-xs text-ops-tx2">{label}</span>
    </div>
  )
}

function FilterChip({
  active,
  label,
  count,
  colorActive = "blue",
  onClick,
}: {
  active: boolean
  label: string
  count?: number
  colorActive?: "blue" | "green" | "coral" | "amber"
  onClick: () => void
}) {
  const activeCls = {
    blue: "bg-ops-blue text-white",
    green: "bg-ops-green text-white",
    coral: "bg-ops-coral text-white",
    amber: "bg-ops-amber text-white",
  }[colorActive]

  const badgeCls = active ? "bg-white/20 text-white" : "bg-ops-line text-ops-tx2"

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
        active
          ? activeCls
          : "border border-ops-line bg-white text-ops-tx2 hover:border-ops-blue/40 hover:text-ops-tx"
      )}
    >
      {label}
      {count !== undefined && (
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums", badgeCls)}>
          {count}
        </span>
      )}
    </button>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function VisitorsView({ clients, sessions, leadStats, currentClientId, currentDays }: Props) {
  const router = useRouter()
  const [sourceFilter, setSourceFilter] = useState("all")
  const [actionFilter, setActionFilter] = useState<ActionKey>("all")
  const [landingFilter, setLandingFilter] = useState<string | undefined>(undefined)
  const [showAllLandings, setShowAllLandings] = useState(false)

  const selectedClient = clients.find((c) => c.id === currentClientId) ?? null

  // ── Navegación con URL params ──────────────────────────────────────────────
  function navigate(newClientId?: string, newDays?: string) {
    const p = new URLSearchParams()
    if (newClientId) p.set("clientId", newClientId)
    if (newDays) p.set("days", newDays)
    router.push(`/dashboard/visitors?${p}`)
    // Reset client-side filters on navigation
    setSourceFilter("all")
    setActionFilter("all")
    setLandingFilter(undefined)
    setShowAllLandings(false)
  }

  // ── Filtrado en cascada ────────────────────────────────────────────────────
  const sourcedSessions = applySourceFilter(sessions, sourceFilter)
  const landedSessions  = applyLandingFilter(sourcedSessions, landingFilter)
  const visibleSessions = applyActionFilter(landedSessions, actionFilter)

  // ── Conteos para chips de fuente ───────────────────────────────────────────
  const sourceMap = new Map<string, { count: number; info: SourceInfo }>()
  for (const s of sessions) {
    const info = resolveSource(s.utmSource, s.referrer)
    const existing = sourceMap.get(info.key)
    if (existing) existing.count++
    else sourceMap.set(info.key, { count: 1, info })
  }
  const topSources = Array.from(sourceMap.entries()).sort((a, b) => b[1].count - a[1].count)

  // ── Conteos para chips de landing ──────────────────────────────────────────
  const landingMap = new Map<string, number>()
  for (const s of sourcedSessions) {
    const p = extractPath(s.firstPageUrl) ?? "__none__"
    landingMap.set(p, (landingMap.get(p) ?? 0) + 1)
  }
  const allLandings = Array.from(landingMap.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
  const visibleLandings = showAllLandings ? allLandings : allLandings.slice(0, 8)

  // ── KPIs globales (sobre todas las sesiones del cliente) ───────────────────
  const totalUnique   = sessions.length
  const withIntent    = sessions.filter((s) => s.hasViewProduct || s.hasAddToCart || s.hasInfoRequest || s.hasCheckout || s.hasPurchase).length
  const linked        = sessions.filter((s) => s.linkedLeadId !== null).length
  const checkouts     = sessions.filter((s) => s.hasCheckout).length
  const cartAbandoned = sessions.filter((s) => s.hasCheckout && !s.hasPurchase).length
  const purchases     = sessions.filter((s) => s.hasPurchase).length
  const durMs         = sessions.map((s) => s.sessionDurationMs).filter((ms) => ms > 0)
  const avgDur        = durMs.length > 0 ? Math.round(durMs.reduce((a, b) => a + b, 0) / durMs.length) : 0

  // ── Conteos de acción (sobre sesiones filtradas por fuente + landing) ──────
  const counts: Record<ActionKey, number> = {
    all:           landedSessions.length,
    purchase:      landedSessions.filter((s) => s.hasPurchase).length,
    checkout:      landedSessions.filter((s) => s.hasCheckout).length,
    cart_abandoned:landedSessions.filter((s) => s.hasCheckout && !s.hasPurchase).length,
    cart:          landedSessions.filter((s) => s.hasAddToCart).length,
    lead:          landedSessions.filter((s) => s.hasFormSubmit).length,
    linked:        landedSessions.filter((s) => s.linkedLeadId !== null).length,
    product:       landedSessions.filter((s) => s.hasViewProduct).length,
    info:          landedSessions.filter((s) => s.hasInfoRequest).length,
    passive:       landedSessions.filter(
      (s) => !s.hasCheckout && !s.hasAddToCart && !s.hasViewProduct && !s.hasFormSubmit && !s.hasPurchase && !s.hasInfoRequest
    ).length,
  }

  // ── Definición de filtros de acción ───────────────────────────────────────
  const ACTION_FILTERS: { key: ActionKey; label: string; icon?: React.ElementType; color: "blue" | "green" | "coral" | "amber" }[] = [
    { key: "all",           label: "Todos",               color: "blue" },
    { key: "purchase",      label: "Compra",               icon: DollarSign,   color: "green" },
    { key: "checkout",      label: "Checkout",             icon: CreditCard,   color: "amber" },
    { key: "cart_abandoned",label: "Carrito abandonado",   icon: ShoppingCart, color: "coral" },
    { key: "linked",        label: "Lead vinculado",       icon: UserCheck,    color: "green" },
    { key: "lead",          label: "Formulario",           icon: FileText,     color: "blue" },
    { key: "cart",          label: "Añadió al carrito",    icon: ShoppingCart, color: "amber" },
    { key: "product",       label: "Vio producto",         icon: Eye,          color: "blue" },
    { key: "info",          label: "Solicitó info",        icon: Info,         color: "blue" },
    { key: "passive",       label: "Solo navegación",      icon: Activity,     color: "blue" },
  ]

  const DAYS_OPTIONS = ["7", "30", "90"] as const

  // ── Sin cliente seleccionado: grid de clientes ─────────────────────────────
  const noClientContent = (
    <div className="px-4 py-6 md:px-7">
      {clients.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center">
          <div className="mx-auto max-w-sm rounded-[20px] border border-ops-line bg-ops-s1 px-8 py-10 text-center shadow-ops-card">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ops-blue-bg">
              <ScanEye className="h-5 w-5 text-ops-blue" />
            </div>
            <p className="mb-1 text-[15px] font-semibold text-ops-tx">Sin clientes</p>
            <p className="text-sm text-ops-tx2">Crea un cliente y configura el pixel para ver sus visitantes.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-ops-tx3">
            Selecciona un cliente para ver sus visitantes
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {clients.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(c.id, "30")}
                className="flex flex-col items-start gap-2 rounded-[20px] border border-ops-line bg-white px-5 py-5 text-left shadow-ops-card transition-all hover:border-ops-blue/40 hover:shadow-lg"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ops-blue-bg">
                  <Building2 className="h-5 w-5 text-ops-blue" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ops-tx">{c.name}</p>
                  <p className="mt-0.5 text-xs text-ops-tx3">Ver visitantes →</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex min-h-full flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-ops-line px-4 py-5 md:px-7 md:py-6">
        <PageHeader
          eyebrow="VISITANTES"
          title="Visitantes"
          subtitle="Actividad de sesiones en tus landing pages — filtros, eventos, leads vinculados y más."
          actions={
            currentClientId ? (
              <div className="flex items-center gap-1 rounded-full border border-ops-line bg-ops-s1 p-1">
                {DAYS_OPTIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => navigate(currentClientId, d)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      currentDays === d
                        ? "bg-ops-blue text-white"
                        : "text-ops-tx3 hover:text-ops-tx2"
                    )}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            ) : null
          }
        />
      </div>

      {/* ── Selector de cliente (chips) ─────────────────────────────────── */}
      {clients.length > 0 && (
        <div className="border-b border-ops-line bg-ops-s1">
          <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-3 md:px-7">
            <button
              onClick={() => navigate(undefined, currentDays)}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                !currentClientId
                  ? "bg-ops-blue text-white"
                  : "border border-ops-line bg-white text-ops-tx2 hover:border-ops-blue/40 hover:text-ops-tx"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              Todos los clientes
            </button>
            {clients.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(c.id, currentDays)}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                  currentClientId === c.id
                    ? "bg-ops-blue text-white"
                    : "border border-ops-line bg-white text-ops-tx2 hover:border-ops-blue/40 hover:text-ops-tx"
                )}
              >
                <Building2 className="h-3.5 w-3.5" />
                <span className="max-w-[140px] truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Sin cliente seleccionado ────────────────────────────────────── */}
      {!currentClientId && noClientContent}

      {/* ── Con cliente seleccionado ────────────────────────────────────── */}
      {currentClientId && selectedClient && (
        <>
          {/* ── KPIs strip ─────────────────────────────────────────────── */}
          <div className="border-b border-ops-line bg-white px-4 py-3 md:px-7">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <StatItem value={totalUnique} label="únicos" />
              <div className="h-4 w-px bg-ops-line" />
              <StatItem value={withIntent} label="con intención" color="amber" />
              <div className="h-4 w-px bg-ops-line" />
              <StatItem value={linked} label="leads vinculados" color="green" />
              <div className="h-4 w-px bg-ops-line" />
              <StatItem value={checkouts} label="checkouts" />
              <div className="h-4 w-px bg-ops-line" />
              <StatItem value={cartAbandoned} label="carritos abandon." color="coral" />
              <div className="h-4 w-px bg-ops-line" />
              <StatItem value={purchases} label="compras" color="green" />
              {avgDur > 0 && (
                <>
                  <div className="h-4 w-px bg-ops-line" />
                  <StatItem value={formatDuration(avgDur)} label="promedio/sesión" />
                </>
              )}
            </div>
          </div>

          {/* ── Filtros client-side ─────────────────────────────────────── */}
          <div className="border-b border-ops-line bg-ops-s1 px-4 py-3 md:px-7 space-y-2.5">
            {/* Fuente */}
            {topSources.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-14 shrink-0 text-[11px] font-medium text-ops-tx3">Fuente</span>
                <FilterChip
                  active={sourceFilter === "all"}
                  label="Todas"
                  count={sessions.length}
                  onClick={() => setSourceFilter("all")}
                />
                {topSources.map(([key, { count, info }]) => (
                  <FilterChip
                    key={key}
                    active={sourceFilter === key}
                    label={info.label}
                    count={count}
                    onClick={() => setSourceFilter(key)}
                  />
                ))}
              </div>
            )}

            {/* Landing page */}
            {allLandings.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-14 shrink-0 text-[11px] font-medium text-ops-tx3">
                  <Globe className="inline h-3 w-3 mr-0.5" />
                  Landing
                </span>
                <FilterChip
                  active={!landingFilter}
                  label="Todas"
                  count={sourcedSessions.length}
                  onClick={() => setLandingFilter(undefined)}
                />
                {visibleLandings.map(({ path, count }) => (
                  <button
                    key={path}
                    onClick={() => setLandingFilter(path === landingFilter ? undefined : path)}
                    className={cn(
                      "flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs transition-colors font-mono",
                      landingFilter === path
                        ? "bg-ops-blue text-white"
                        : "border border-ops-line bg-white text-ops-tx3 hover:border-ops-blue/40 hover:text-ops-tx2"
                    )}
                  >
                    {path === "__none__" ? "(sin URL)" : path}
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold font-sans tabular-nums",
                      landingFilter === path ? "bg-white/20 text-white" : "bg-ops-line text-ops-tx2"
                    )}>
                      {count}
                    </span>
                  </button>
                ))}
                {allLandings.length > 8 && (
                  <button
                    onClick={() => setShowAllLandings((v) => !v)}
                    className="flex h-8 items-center gap-0.5 rounded-full border border-ops-line bg-white px-3 text-xs text-ops-tx3 hover:text-ops-tx2 transition-colors"
                  >
                    {showAllLandings
                      ? <><ChevronUp className="h-3 w-3" />Menos</>
                      : <><ChevronDown className="h-3 w-3" />+{allLandings.length - 8} más</>}
                  </button>
                )}
              </div>
            )}

            {/* Acción */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-14 shrink-0 text-[11px] font-medium text-ops-tx3">Acción</span>
              {ACTION_FILTERS.map(({ key, label, icon: Icon, color }) => (
                <FilterChip
                  key={key}
                  active={actionFilter === key}
                  label={label}
                  count={counts[key]}
                  colorActive={color}
                  onClick={() => setActionFilter(key)}
                />
              ))}
            </div>
          </div>

          {/* ── Leads generados ─────────────────────────────────────────── */}
          {leadStats.total > 0 && (
            <div className="border-b border-ops-line bg-ops-green-bg/40 px-4 py-3 md:px-7">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-ops-green" />
                  <span className="text-xs font-semibold text-ops-green">
                    {leadStats.total} leads en los últimos {currentDays} días
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {leadStats.breakdown.slice(0, 5).map((entry) => {
                    const isSin = entry.path === "(sin seguimiento)"
                    const pct = Math.round((entry.count / leadStats.total) * 100)
                    return (
                      <span
                        key={entry.path}
                        title={isSin ? "Leads de Meta Lead Ads — sin URL de landing" : entry.path}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]",
                          isSin
                            ? "border-ops-line bg-white text-ops-tx3 italic"
                            : "border-ops-green/30 bg-white font-mono text-ops-tx2"
                        )}
                      >
                        {entry.path}
                        <span className="font-bold font-sans text-ops-tx">{entry.count}</span>
                        <span className="text-ops-tx3">{pct}%</span>
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Lista de sesiones ────────────────────────────────────────── */}
          <div className="flex-1 overflow-auto">
            {/* Cabecera de la lista */}
            <div className="flex items-center justify-between border-b border-ops-line bg-ops-s1 px-4 py-2.5 md:px-7">
              <span className="text-xs font-semibold uppercase tracking-wider text-ops-tx3">
                {selectedClient.name} · últimos {currentDays} días
              </span>
              <span className="font-plex text-xs tabular-nums text-ops-tx2">
                {visibleSessions.length} de {sessions.length} sesiones
              </span>
            </div>

            {visibleSessions.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ops-blue-bg">
                  <Users className="h-6 w-6 text-ops-blue" />
                </div>
                <p className="text-sm font-semibold text-ops-tx">
                  {actionFilter !== "all" || landingFilter || sourceFilter !== "all"
                    ? "Ningún visitante coincide con los filtros"
                    : "Sin visitantes en este periodo"}
                </p>
                {actionFilter === "all" && !landingFilter && sourceFilter === "all" && (
                  <p className="max-w-xs text-xs text-ops-tx2">
                    Los visitantes aparecen cuando llegan vía Facebook, Instagram o WhatsApp Ads con
                    utm_source de Meta o cookie _fbc.
                  </p>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-ops-line/60">
                {visibleSessions.map((session) => {
                  const src = resolveSource(session.utmSource, session.referrer)
                  const landing = extractPath(session.firstPageUrl)
                  const leadUrl = session.linkedLeadId && session.linkedCampaignId
                    ? `/dashboard/campaigns/${session.linkedCampaignId}/leads?search=${encodeURIComponent(session.linkedLeadName ?? "")}`
                    : null

                  return (
                    <li key={session.visitorId} className="relative hover:bg-ops-s1/50 transition-colors">
                      {/* Card-link al detalle del visitante */}
                      <Link
                        href={`/dashboard/clients/${currentClientId}/tracking/visitors/${session.visitorId}`}
                        className="absolute inset-0"
                        aria-label={`Ver historial de visitante ${session.visitorId.slice(0, 8)}`}
                      />

                      <div className="pointer-events-none relative flex items-start gap-3 px-4 py-3 md:px-7">
                        {/* ID */}
                        <span className="mt-0.5 shrink-0 rounded-lg bg-ops-blue-bg px-2 py-1 font-mono text-[11px] font-semibold text-ops-blue">
                          #{session.visitorId.slice(0, 8)}
                        </span>

                        {/* Info principal */}
                        <div className="min-w-0 flex-1">
                          {/* Fila 1: badges */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Fuente */}
                            <span className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              src.bg, src.text, src.border
                            )}>
                              {src.label}
                            </span>

                            {/* Lead vinculado */}
                            {session.linkedLeadId && session.linkedCampaignId ? (
                              <Link
                                href={leadUrl!}
                                target="_blank"
                                className="pointer-events-auto relative z-10 inline-flex items-center gap-1 rounded-full border border-ops-green/40 bg-ops-green-bg px-2 py-0.5 text-[11px] font-semibold text-ops-green hover:opacity-80 transition-opacity"
                              >
                                <UserCheck className="h-3 w-3" />
                                {session.linkedLeadName ?? "lead"} ↗
                              </Link>
                            ) : session.hasFormSubmit ? (
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-ops-blue/30 bg-ops-blue-bg px-2 py-0.5 text-[11px] font-medium text-ops-blue">
                                <FileText className="h-3 w-3" />formulario
                              </span>
                            ) : null}

                            {/* Señales de comportamiento */}
                            {session.hasPurchase && (
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-ops-green/30 bg-ops-green-bg px-2 py-0.5 text-[11px] font-medium text-ops-green">
                                <DollarSign className="h-3 w-3" />compra
                              </span>
                            )}
                            {session.hasCheckout && !session.hasPurchase && (
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-ops-coral/30 bg-ops-coral-bg px-2 py-0.5 text-[11px] font-medium text-ops-coral">
                                <CreditCard className="h-3 w-3" />carrito aband.
                              </span>
                            )}
                            {session.hasCheckout && session.hasPurchase && (
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-ops-amber/30 bg-ops-amber-bg px-2 py-0.5 text-[11px] font-medium text-ops-amber">
                                <CreditCard className="h-3 w-3" />checkout
                              </span>
                            )}
                            {session.hasAddToCart && !session.hasCheckout && (
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-ops-amber/30 bg-ops-amber-bg px-2 py-0.5 text-[11px] font-medium text-ops-amber">
                                <ShoppingCart className="h-3 w-3" />carrito
                              </span>
                            )}
                            {session.hasInfoRequest && (
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-ops-blue/20 bg-ops-blue-bg px-2 py-0.5 text-[11px] font-medium text-ops-blue">
                                <Info className="h-3 w-3" />info
                              </span>
                            )}
                            {session.hasViewProduct && !session.hasAddToCart && (
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-ops-line bg-ops-s1 px-2 py-0.5 text-[11px] text-ops-tx3">
                                <Eye className="h-3 w-3" />producto
                              </span>
                            )}
                          </div>

                          {/* Fila 2: metadatos */}
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ops-tx3">
                            <span>{session.eventCount} evento{session.eventCount !== 1 ? "s" : ""}</span>
                            {session.uniquePageCount > 1 && (
                              <span>· {session.uniquePageCount} páginas</span>
                            )}
                            {landing && (
                              <span className="font-mono truncate max-w-[180px]" title={session.firstPageUrl ?? ""}>
                                · {landing}
                              </span>
                            )}
                            {session.utmCampaign && (
                              <span className="truncate max-w-[160px]" title={session.utmCampaign}>
                                · {session.utmCampaign}
                              </span>
                            )}
                            {(session.visitorCity || session.visitorCountry) && (
                              <span>
                                · {session.visitorCountry && countryFlag(session.visitorCountry)}{" "}
                                {[session.visitorCity, session.visitorCountry].filter(Boolean).join(", ")}
                              </span>
                            )}
                          </p>
                        </div>

                        {/* Tiempo y fecha */}
                        <div className="shrink-0 text-right">
                          {session.sessionDurationMs > 0 && (
                            <p className="text-xs font-semibold text-ops-tx2">
                              {formatDuration(session.sessionDurationMs)}
                            </p>
                          )}
                          <p className="text-[11px] text-ops-tx3">{relativeTime(session.lastSeen)}</p>
                        </div>

                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ops-tx3" />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {/* Cliente en URL pero no existe */}
      {currentClientId && !selectedClient && (
        <div className="flex items-center justify-center p-16 text-center">
          <div>
            <p className="text-sm font-medium text-ops-tx">Cliente no encontrado</p>
            <button
              onClick={() => navigate(undefined)}
              className="mt-3 text-xs text-ops-blue hover:underline"
            >
              ← Volver
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

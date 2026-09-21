"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Search, Users, ShoppingCart, X, FileText, Info, Plus, BadgeDollarSign, Trash2, Zap, Target, Globe, Upload } from "lucide-react"
import { LeadDrawer } from "./LeadDrawer"
import type { Campaign, Client, Temperature, LeadStage, SalesRep } from "@/lib/db/schema"
import type { LeadWithActivity } from "@/domains/leads/repository"
import {
  deleteLeadsAction,
  deleteLeadsByCampaignAction,
  deleteLeadsByClientAction,
} from "@/domains/leads/actions"

interface Props {
  leads: LeadWithActivity[]
  campaign: Campaign & { client: Client | null }
  whatsappNumbers: string[]
  orgName: string
  salesReps?: SalesRep[]
  currentUserId?: string
}

const TEMPERATURES: { value: Temperature | ""; label: string }[] = [
  { value: "", label: "Temperatura" },
  { value: "hot", label: "Caliente" },
  { value: "warm", label: "Tibio" },
  { value: "cold", label: "Frío" },
]

const STAGES: { value: LeadStage | ""; label: string }[] = [
  { value: "", label: "Etapa" },
  { value: "new", label: "Nuevo" },
  { value: "contacted", label: "Contactado" },
  { value: "interested", label: "Interesado" },
  { value: "quoted", label: "Cotizado" },
  { value: "won", label: "Ganado" },
  { value: "lost", label: "Perdido" },
]

const SOURCES: { value: string; label: string }[] = [
  { value: "", label: "Fuente" },
  { value: "meta_ads", label: "Meta Ads" },
  { value: "organic", label: "Orgánico" },
  { value: "imported", label: "Importado" },
]

const ACTIVITIES: { value: string; label: string }[] = [
  { value: "", label: "Actividad" },
  { value: "has_sale", label: "Con venta" },
  { value: "pending_capi", label: "CAPI pendiente" },
  { value: "checkout", label: "Inició checkout" },
  { value: "cart_abandoned", label: "Abandonó carrito" },
  { value: "form_submitted", label: "Llenó formulario" },
  { value: "info_requested", label: "Solicitó info" },
]

function tempBadge(t: string) {
  if (t === "hot") return "bg-red-500/15 text-red-400"
  if (t === "warm") return "bg-amber-500/15 text-amber-400"
  return "bg-blue-500/15 text-blue-400"
}

function tempLabel(t: string) {
  if (t === "hot") return "Caliente"
  if (t === "warm") return "Tibio"
  return "Frío"
}

function stageBadge(s: string) {
  if (s === "new") return "bg-zinc-700/60 text-zinc-400"
  if (s === "contacted") return "bg-blue-500/15 text-blue-400"
  if (s === "interested") return "bg-indigo-500/15 text-indigo-400"
  if (s === "quoted") return "bg-purple-500/15 text-purple-400"
  if (s === "won") return "bg-emerald-500/15 text-emerald-400"
  if (s === "lost") return "bg-red-500/15 text-red-400"
  return "bg-zinc-700/60 text-zinc-400"
}

function stageLabel(s: string) {
  const labels: Record<string, string> = {
    new: "Nuevo",
    contacted: "Contactado",
    interested: "Interesado",
    quoted: "Cotizado",
    won: "Ganado",
    lost: "Perdido",
  }
  return labels[s] ?? s
}

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date))
}

function formatMoney(amount: string, currency: string) {
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(parseFloat(amount))
}

function SourceBadge({ source }: { source: string }) {
  if (source === "meta_ads")
    return (
      <span title="Meta Ads" className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30 whitespace-nowrap">
        <Target className="h-2.5 w-2.5" />Meta
      </span>
    )
  if (source === "imported")
    return (
      <span title="Importado desde archivo" className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30 whitespace-nowrap">
        <Upload className="h-2.5 w-2.5" />CSV
      </span>
    )
  return (
    <span title="Orgánico" className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
      <Globe className="h-2.5 w-2.5" />Org
    </span>
  )
}

function ActivityBadges({
  activity,
  hasPendingCapi,
}: {
  activity: LeadWithActivity["activity"]
  hasPendingCapi?: boolean
}) {
  const badges = [
    { active: activity.hasCheckout, Icon: ShoppingCart, label: "Checkout", color: "text-indigo-400", bg: "bg-indigo-500/15" },
    { active: activity.hasAbandonedCart, Icon: X, label: "Abandonó carrito", color: "text-orange-400", bg: "bg-orange-500/15" },
    { active: activity.hasAddToCart, Icon: Plus, label: "Agregó al carrito", color: "text-cyan-400", bg: "bg-cyan-500/15" },
    { active: activity.hasFormSubmit, Icon: FileText, label: "Formulario", color: "text-emerald-400", bg: "bg-emerald-500/15" },
    { active: activity.hasInfoRequest, Icon: Info, label: "Info", color: "text-purple-400", bg: "bg-purple-500/15" },
  ].filter((b) => b.active)

  if (badges.length === 0 && !hasPendingCapi) return <span className="text-zinc-600 text-xs">—</span>

  return (
    <div className="flex gap-1 flex-wrap">
      {badges.map(({ Icon, label, color, bg }) => (
        <span
          key={label}
          title={label}
          className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${bg} ${color}`}
        >
          <Icon className="h-3 w-3" />
        </span>
      ))}
      {hasPendingCapi && (
        <span title="CAPI pendiente" className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium bg-amber-500/15 text-amber-400">
          <Zap className="h-3 w-3" />
        </span>
      )}
    </div>
  )
}

export function LeadsView({ leads, campaign, whatsappNumbers, orgName, salesReps = [], currentUserId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const currentSearch = searchParams.get("search") ?? ""
  const currentTemp = searchParams.get("temperature") ?? ""
  const currentStage = searchParams.get("stage") ?? ""
  const currentAssignment = searchParams.get("assignment") ?? ""
  const currentRepId = searchParams.get("repId") ?? ""
  const currentActivity = searchParams.get("activity") ?? ""
  const currentSource = searchParams.get("source") ?? ""

  const [searchInput, setSearchInput] = useState(currentSearch)
  const [drawerLead, setDrawerLead] = useState<LeadWithActivity | null>(null)

  // Bulk delete state
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<"selected" | "campaign" | "client" | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Clear selection when leads list changes (e.g. after filter or delete)
  useEffect(() => {
    setSelectedLeads(new Set())
    setDeleteConfirm(null)
    setDeleteError(null)
  }, [leads])

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    startTransition(() => {
      router.push(`?${params.toString()}`)
    })
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== currentSearch) {
        updateFilter("search", searchInput)
      }
    }, 400)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  function handleSelectLead(id: string, checked: boolean) {
    setSelectedLeads((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedLeads(new Set(leads.map((l) => l.id)))
    } else {
      setSelectedLeads(new Set())
    }
  }

  function handleDeleteSelected() {
    setDeleteError(null)
    startTransition(async () => {
      try {
        const result = await deleteLeadsAction([...selectedLeads])
        if (result.error) {
          setDeleteError(result.error)
        } else {
          setDeleteConfirm(null)
          router.refresh()
        }
      } catch {
        setDeleteError("Error inesperado.")
      }
    })
  }

  function handleDeleteCampaign() {
    setDeleteError(null)
    startTransition(async () => {
      try {
        const result = await deleteLeadsByCampaignAction(campaign.id)
        if (result.error) {
          setDeleteError(result.error)
        } else {
          setDeleteConfirm(null)
          router.refresh()
        }
      } catch {
        setDeleteError("Error inesperado.")
      }
    })
  }

  function handleDeleteClient() {
    if (!campaign.clientId) return
    setDeleteError(null)
    startTransition(async () => {
      try {
        const result = await deleteLeadsByClientAction(campaign.clientId!)
        if (result.error) {
          setDeleteError(result.error)
        } else {
          setDeleteConfirm(null)
          router.refresh()
        }
      } catch {
        setDeleteError("Error inesperado.")
      }
    })
  }

  const hasFilters = !!(currentSearch || currentTemp || currentStage || currentAssignment || currentRepId || currentActivity || currentSource)
  const allSelected = leads.length > 0 && selectedLeads.size === leads.length
  const someSelected = selectedLeads.size > 0 && selectedLeads.size < leads.length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            href="/dashboard/campaigns"
            className="mt-0.5 p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">{campaign.name}</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {campaign.client?.name ?? orgName} · {leads.length} leads
            </p>
          </div>
        </div>

        {/* Bulk delete by campaign / client */}
        {leads.length > 0 && (
          <div className="flex items-center gap-2">
            {deleteConfirm === "campaign" ? (
              <div className="flex items-center gap-2 bg-zinc-800 border border-red-800/50 rounded-lg px-3 py-1.5">
                <span className="text-xs text-zinc-400">¿Eliminar {leads.length} leads de la campaña?</span>
                <button
                  onClick={handleDeleteCampaign}
                  disabled={isPending}
                  className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
                >
                  {isPending ? "Eliminando…" : "Confirmar"}
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={isPending}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Cancelar
                </button>
              </div>
            ) : deleteConfirm === "client" && campaign.clientId ? (
              <div className="flex items-center gap-2 bg-zinc-800 border border-red-800/50 rounded-lg px-3 py-1.5">
                <span className="text-xs text-zinc-400">¿Eliminar todos los leads del cliente?</span>
                <button
                  onClick={handleDeleteClient}
                  disabled={isPending}
                  className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
                >
                  {isPending ? "Eliminando…" : "Confirmar"}
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={isPending}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDeleteConfirm("campaign")}
                  title="Eliminar todos los leads de esta campaña"
                  className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-red-400 transition-colors px-2.5 py-2 rounded-lg hover:bg-zinc-800"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Campaña
                </button>
                {campaign.clientId && (
                  <button
                    onClick={() => setDeleteConfirm("client")}
                    title="Eliminar todos los leads del cliente (todas las campañas)"
                    className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-red-400 transition-colors px-2.5 py-2 rounded-lg hover:bg-zinc-800"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Cliente
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar nombre, email, teléfono…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 w-72 transition-colors"
          />
        </div>

        <select
          value={currentTemp}
          onChange={(e) => updateFilter("temperature", e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          {TEMPERATURES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <select
          value={currentStage}
          onChange={(e) => updateFilter("stage", e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          value={currentSource}
          onChange={(e) => updateFilter("source", e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          value={currentActivity}
          onChange={(e) => updateFilter("activity", e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          {ACTIVITIES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>

        {/* Assignment filters */}
        <select
          value={currentAssignment}
          onChange={(e) => updateFilter("assignment", e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          <option value="">Asignación</option>
          <option value="unassigned">Sin asignar</option>
          {currentUserId && <option value="mine">Asignados a mí</option>}
        </select>

        {salesReps.length > 0 && (
          <select
            value={currentRepId}
            onChange={(e) => updateFilter("repId", e.target.value)}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="">Vendedor</option>
            {salesReps.map((r) => (
              <option key={r.id} value={r.id}>{r.displayName}</option>
            ))}
          </select>
        )}

        {hasFilters && (
          <button
            onClick={() => {
              setSearchInput("")
              router.push(`?`)
            }}
            className="px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Error */}
      {deleteError && (
        <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
          {deleteError}
        </p>
      )}

      {/* Bulk selection bar */}
      {selectedLeads.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg">
          <span className="text-sm text-zinc-300">
            {selectedLeads.size} lead{selectedLeads.size !== 1 ? "s" : ""} seleccionado{selectedLeads.size !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-3">
            {deleteConfirm === "selected" ? (
              <>
                <span className="text-xs text-zinc-400">¿Confirmar eliminación?</span>
                <button
                  onClick={handleDeleteSelected}
                  disabled={isPending}
                  className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
                >
                  {isPending ? "Eliminando…" : "Eliminar"}
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={isPending}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                onClick={() => setDeleteConfirm("selected")}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-medium"
              >
                <Trash2 className="h-3 w-3" />
                Eliminar seleccionados
              </button>
            )}
            <button
              onClick={() => setSelectedLeads(new Set())}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Cancelar selección
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
            <Users className="h-7 w-7 text-zinc-500" />
          </div>
          <p className="text-zinc-300 font-medium">Sin leads todavía</p>
          <p className="text-zinc-500 text-sm mt-1 max-w-xs">
            {hasFilters
              ? "No hay leads que coincidan con los filtros."
              : "Los leads llegarán cuando configures tu landing page con la API key de esta campaña."}
          </p>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[1300px]">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="pl-4 pr-2 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-zinc-600 bg-zinc-800 accent-indigo-500 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Nombre</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Teléfono</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Email</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Temp.</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Etapa</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Venta</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Conjunto</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Anuncio</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Asignado</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Actividad</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => setDrawerLead(lead)}
                  className={`hover:bg-zinc-800/40 transition-colors cursor-pointer ${selectedLeads.has(lead.id) ? "bg-indigo-900/10" : "bg-transparent"}`}
                >
                  <td className="pl-4 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedLeads.has(lead.id)}
                      onChange={(e) => handleSelectLead(lead.id, e.target.checked)}
                      className="rounded border-zinc-600 bg-zinc-800 accent-indigo-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-1.5">
                      <SourceBadge source={lead.leadSource} />
                      <div>
                        <span className="font-medium text-zinc-100">{lead.name}</span>
                        {lead.city && (
                          <span className="block text-xs text-zinc-500 mt-0.5">{lead.city}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">
                    {lead.phone ?? <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs max-w-[180px] truncate">
                    {lead.email ?? <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${tempBadge(lead.temperature)}`}
                    >
                      {tempLabel(lead.temperature)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${stageBadge(lead.stage)}`}
                    >
                      {stageLabel(lead.stage)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {lead.saleCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400">
                        <BadgeDollarSign className="h-3 w-3" />
                        {lead.saleTotalAmount
                          ? formatMoney(lead.saleTotalAmount, lead.saleCurrency ?? "USD")
                          : `${lead.saleCount} ${lead.saleCount === 1 ? "venta" : "ventas"}`}
                        {lead.saleCount > 1 && lead.saleTotalAmount && (
                          <span className="opacity-60">·{lead.saleCount}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[160px] truncate">
                    {lead.metaAdsetName
                      ? <span className="text-indigo-400/80">{lead.metaAdsetName}</span>
                      : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[160px] truncate">
                    {lead.metaAdName
                      ? <span className="text-zinc-300">{lead.metaAdName}</span>
                      : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[120px] truncate">
                    {lead.assignedTo
                      ? <span className="text-zinc-300">{lead.assignedTo}</span>
                      : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <ActivityBadges activity={lead.activity} hasPendingCapi={lead.hasPendingCapi} />
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                    {formatDate(lead.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LeadDrawer
        lead={drawerLead}
        open={!!drawerLead}
        onClose={() => {
          setDrawerLead(null)
          router.refresh()
        }}
        whatsappNumbers={whatsappNumbers}
        clientId={campaign.clientId ?? undefined}
        salesReps={salesReps}
      />
    </div>
  )
}

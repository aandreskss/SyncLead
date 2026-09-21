"use client"

import { useState, useEffect, useTransition, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Search, Users, BadgeDollarSign, Trash2, Zap,
  Target, Globe, Upload, ShoppingCart, FileText, Info, CheckCircle,
} from "lucide-react"
import { LeadDrawer } from "@/app/dashboard/campaigns/[id]/leads/_components/LeadDrawer"
import type { Temperature, LeadStage, SalesRep } from "@/lib/db/schema"
import type { LeadWithActivity } from "@/domains/leads/repository"
import { deleteLeadsAction, deleteLeadsByClientAction } from "@/domains/leads/actions"

interface Props {
  clientId: string
  leads: LeadWithActivity[]
  totalLeads: number
  campaigns: { id: string; name: string }[]
  salesReps: SalesRep[]
  whatsappNumbers: string[]
  filters: {
    search: string
    temperature: string
    stage: string
    campaignId: string
    repId: string
    assignment: string
    converted: string
    source: string
    activity: string
  }
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

const CONVERSION_FILTERS = [
  { value: "", label: "Venta" },
  { value: "yes", label: "Con venta" },
  { value: "no", label: "Sin venta" },
]

const SOURCES = [
  { value: "", label: "Fuente" },
  { value: "meta_ads", label: "Meta Ads" },
  { value: "organic", label: "Orgánico" },
  { value: "imported", label: "Importado" },
]

const ACTIVITIES = [
  { value: "", label: "Actividad" },
  { value: "has_sale", label: "Con venta" },
  { value: "pending_capi", label: "CAPI pendiente" },
  { value: "checkout", label: "Checkout" },
  { value: "cart_abandoned", label: "Carrito abandonado" },
  { value: "form_submitted", label: "Formulario enviado" },
  { value: "info_requested", label: "Info solicitada" },
]

function tempBadge(t: string) {
  if (t === "hot") return "bg-red-500/20 text-red-400 border border-red-500/30"
  if (t === "warm") return "bg-amber-500/20 text-amber-400 border border-amber-500/30"
  return "bg-blue-500/20 text-blue-400 border border-blue-500/30"
}

function tempLabel(t: string) {
  if (t === "hot") return "Caliente"
  if (t === "warm") return "Tibio"
  return "Frío"
}

function stageBadge(s: string) {
  if (s === "new") return "bg-zinc-700/60 text-zinc-400 border border-zinc-600/40"
  if (s === "contacted") return "bg-blue-500/15 text-blue-400 border border-blue-500/25"
  if (s === "interested") return "bg-indigo-500/15 text-indigo-400 border border-indigo-500/25"
  if (s === "quoted") return "bg-purple-500/15 text-purple-400 border border-purple-500/25"
  if (s === "won") return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
  if (s === "lost") return "bg-red-500/15 text-red-400 border border-red-500/25"
  return "bg-zinc-700/60 text-zinc-400 border border-zinc-600/40"
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
  if (source === "meta_ads") {
    return (
      <span title="Meta Ads" className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
        <Target className="h-2.5 w-2.5" />
        Meta
      </span>
    )
  }
  if (source === "imported") {
    return (
      <span title="Importado desde archivo" className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30">
        <Upload className="h-2.5 w-2.5" />
        CSV
      </span>
    )
  }
  return (
    <span title="Orgánico" className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
      <Globe className="h-2.5 w-2.5" />
      Org
    </span>
  )
}

function ActivityBadges({ activity, hasPendingCapi }: { activity: LeadWithActivity["activity"]; hasPendingCapi?: boolean }) {
  const badges = []
  if (hasPendingCapi) badges.push(
    <span key="capi" title="CAPI pendiente" className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
      <Zap className="h-2.5 w-2.5" />
    </span>
  )
  if (activity.hasCheckout) badges.push(
    <span key="checkout" title="Checkout" className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
      <CheckCircle className="h-2.5 w-2.5" />
    </span>
  )
  if (activity.hasAbandonedCart) badges.push(
    <span key="cart" title="Carrito abandonado" className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
      <ShoppingCart className="h-2.5 w-2.5" />
    </span>
  )
  if (activity.hasFormSubmit) badges.push(
    <span key="form" title="Formulario enviado" className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
      <FileText className="h-2.5 w-2.5" />
    </span>
  )
  if (activity.hasInfoRequest) badges.push(
    <span key="info" title="Info solicitada" className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-400 border border-zinc-600/40">
      <Info className="h-2.5 w-2.5" />
    </span>
  )
  if (badges.length === 0) return <span className="text-zinc-600 text-xs">—</span>
  return <div className="flex items-center gap-1 flex-wrap">{badges}</div>
}

export function ClientLeadsTab({
  clientId,
  leads,
  totalLeads,
  campaigns,
  salesReps,
  whatsappNumbers,
  filters,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const mutated = useRef(false)

  const [searchInput, setSearchInput] = useState(filters.search)
  const [drawerLead, setDrawerLead] = useState<LeadWithActivity | null>(null)
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<"selected" | "client" | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const hotCount = leads.filter((l) => l.temperature === "hot").length
  const convertedCount = leads.filter((l) => l.saleCount > 0).length
  const contactedCount = leads.filter((l) => l.stage !== "new").length

  const campaignMap = Object.fromEntries(campaigns.map((c) => [c.id, c.name]))

  useEffect(() => {
    setSelectedLeads(new Set())
    setDeleteConfirm(null)
    setDeleteError(null)
  }, [leads])

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", "leads")
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    startTransition(() => {
      router.push(`?${params.toString()}`)
    })
  }

  function clearFilters() {
    setSearchInput("")
    router.push(`?tab=leads`)
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        updateFilter("search", searchInput)
      }
    }, 400)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  function handleSelectLead(id: string) {
    setSelectedLeads((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSelectAll() {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set())
    } else {
      setSelectedLeads(new Set(leads.map((l) => l.id)))
    }
  }

  function handleDeleteSelected() {
    if (deleteConfirm !== "selected") {
      setDeleteConfirm("selected")
      return
    }
    startTransition(async () => {
      try {
        const result = await deleteLeadsAction([...selectedLeads])
        if (result.error) {
          setDeleteError(result.error)
        } else {
          setSelectedLeads(new Set())
          setDeleteConfirm(null)
          router.refresh()
        }
      } catch {
        setDeleteError("Error al eliminar los leads.")
      }
    })
  }

  function handleDeleteClient() {
    if (deleteConfirm !== "client") {
      setDeleteConfirm("client")
      return
    }
    startTransition(async () => {
      try {
        const result = await deleteLeadsByClientAction(clientId)
        if (result.error) {
          setDeleteError(result.error)
        } else {
          setDeleteConfirm(null)
          router.refresh()
        }
      } catch {
        setDeleteError("Error al eliminar los leads.")
      }
    })
  }

  const hasActiveFilters =
    filters.search || filters.temperature || filters.stage || filters.campaignId ||
    filters.converted || filters.source || filters.activity

  const allSelected = leads.length > 0 && selectedLeads.size === leads.length
  const someSelected = selectedLeads.size > 0 && selectedLeads.size < leads.length

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 mb-1">Total</p>
          <p className="text-2xl font-bold text-zinc-100">{totalLeads}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 mb-1">Calientes</p>
          <p className="text-2xl font-bold text-red-400">{hotCount}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 mb-1">Con venta</p>
          <p className="text-2xl font-bold text-emerald-400">{convertedCount}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 mb-1">Contactados</p>
          <p className="text-2xl font-bold text-blue-400">{contactedCount}</p>
        </div>
      </div>

      {/* Header with delete-all button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{leads.length} leads mostrados</p>
        {leads.length > 0 && (
          <div className="flex items-center gap-2">
            {deleteError && deleteConfirm === "client" && (
              <span className="text-xs text-red-400">{deleteError}</span>
            )}
            {deleteConfirm === "client" ? (
              <>
                <span className="text-xs text-red-400">¿Eliminar todos los leads del cliente permanentemente?</span>
                <button
                  onClick={() => { setDeleteConfirm(null); setDeleteError(null) }}
                  disabled={isPending}
                  className="px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteClient}
                  disabled={isPending}
                  className="px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 bg-red-500/10 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  {isPending ? "Eliminando…" : "Confirmar"}
                </button>
              </>
            ) : (
              <button
                onClick={handleDeleteClient}
                className="px-2.5 py-1.5 text-xs text-zinc-500 hover:text-red-400 border border-zinc-700 hover:border-red-500/30 rounded-lg transition-colors flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Eliminar todos
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedLeads.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
          <span className="text-sm text-indigo-300 font-medium">{selectedLeads.size} seleccionados</span>
          <div className="flex items-center gap-2 ml-auto">
            {deleteError && deleteConfirm === "selected" && (
              <span className="text-xs text-red-400">{deleteError}</span>
            )}
            {deleteConfirm === "selected" ? (
              <>
                <span className="text-xs text-red-400">¿Eliminar permanentemente?</span>
                <button
                  onClick={() => { setDeleteConfirm(null); setDeleteError(null) }}
                  disabled={isPending}
                  className="px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteSelected}
                  disabled={isPending}
                  className="px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 bg-red-500/10 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  {isPending ? "Eliminando…" : "Confirmar"}
                </button>
              </>
            ) : (
              <button
                onClick={handleDeleteSelected}
                className="px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 bg-red-500/10 rounded-lg transition-colors flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Eliminar seleccionados
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar nombre, email, teléfono…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 w-64 transition-colors"
          />
        </div>

        <select
          value={filters.temperature}
          onChange={(e) => updateFilter("temperature", e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          {TEMPERATURES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <select
          value={filters.stage}
          onChange={(e) => updateFilter("stage", e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          value={filters.converted}
          onChange={(e) => updateFilter("converted", e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          {CONVERSION_FILTERS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <select
          value={filters.source}
          onChange={(e) => updateFilter("source", e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          value={filters.activity}
          onChange={(e) => updateFilter("activity", e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          {ACTIVITIES.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>

        {campaigns.length > 0 && (
          <select
            value={filters.campaignId}
            onChange={(e) => updateFilter("campaignId", e.target.value)}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="">Todas las campañas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      {leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
            <Users className="h-7 w-7 text-zinc-500" />
          </div>
          <p className="text-zinc-300 font-medium">Sin leads</p>
          <p className="text-zinc-500 text-sm mt-1 max-w-xs">
            {hasActiveFilters
              ? "No hay leads que coincidan con los filtros."
              : "Este cliente aún no tiene leads en ninguna campaña."}
          </p>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[1350px]">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected }}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Nombre</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Teléfono</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Email</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Temp.</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Etapa</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Venta</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Actividad</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Negocio</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Campaña</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Conjunto</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Anuncio</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Asignado</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => setDrawerLead(lead)}
                  className={`hover:bg-zinc-800/40 transition-colors cursor-pointer ${selectedLeads.has(lead.id) ? "bg-indigo-500/5" : ""}`}
                >
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedLeads.has(lead.id)}
                      onChange={() => handleSelectLead(lead.id)}
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <SourceBadge source={lead.leadSource ?? "organic"} />
                      <span className="font-medium text-zinc-100">{lead.name}</span>
                    </div>
                    {lead.city && (
                      <span className="block text-xs text-zinc-500 mt-0.5">{lead.city}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">
                    {lead.phone ?? <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs max-w-[160px] truncate">
                    {lead.email ?? <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${tempBadge(lead.temperature)}`}>
                      {tempLabel(lead.temperature)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${stageBadge(lead.stage)}`}>
                      {stageLabel(lead.stage)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {lead.saleCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
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
                  <td className="px-4 py-3">
                    <ActivityBadges activity={lead.activity} hasPendingCapi={lead.hasPendingCapi} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {lead.negocio ? (
                      <span className="text-emerald-400 text-xs font-medium">Sí</span>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs max-w-[140px] truncate">
                    {campaignMap[lead.campaignId] ?? <span className="text-zinc-600">—</span>}
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
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {lead.assignedTo ? (
                      <span className="font-mono">{lead.assignedTo}</span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
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
          if (mutated.current) {
            mutated.current = false
          }
          router.refresh()
        }}
        onMutated={() => { mutated.current = true }}
        whatsappNumbers={whatsappNumbers}
        clientId={clientId}
        salesReps={salesReps}
      />
    </div>
  )
}

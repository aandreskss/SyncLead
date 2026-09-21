"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Search, Users, ShoppingCart, X, FileText, Info, Plus, BadgeDollarSign, Trash2, Zap, Target, Globe, Upload } from "lucide-react"
import { LeadDrawer } from "./LeadDrawer"
import { cn } from "@/lib/utils"
import { PageShell, PageHeader, Panel, StatusChip, EmptyState, opsTable, opsField } from "@/components/app/ops"
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

function tempTone(t: string): "coral" | "amber" | "cold" {
  if (t === "hot") return "coral"
  if (t === "warm") return "amber"
  return "cold"
}

function tempLabel(t: string) {
  if (t === "hot") return "Caliente"
  if (t === "warm") return "Tibio"
  return "Frío"
}

function stageTone(s: string): "neutral" | "blue" | "green" | "coral" {
  if (s === "contacted" || s === "interested" || s === "quoted") return "blue"
  if (s === "won") return "green"
  if (s === "lost") return "coral"
  return "neutral"
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
      <span title="Meta Ads" className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded font-semibold bg-ops-blue/20 text-ops-blue-t border border-ops-blue/30 whitespace-nowrap">
        <Target className="h-2.5 w-2.5" />Meta
      </span>
    )
  if (source === "imported")
    return (
      <span title="Importado desde archivo" className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded font-semibold bg-ops-cold/20 text-ops-cold border border-ops-cold/30 whitespace-nowrap">
        <Upload className="h-2.5 w-2.5" />CSV
      </span>
    )
  return (
    <span title="Orgánico" className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded font-semibold bg-ops-green/20 text-ops-green border border-ops-green/30 whitespace-nowrap">
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
    { active: activity.hasCheckout, Icon: ShoppingCart, label: "Checkout", color: "text-ops-blue-t", bg: "bg-ops-blue/15" },
    { active: activity.hasAbandonedCart, Icon: X, label: "Abandonó carrito", color: "text-ops-amber", bg: "bg-ops-amber/15" },
    { active: activity.hasAddToCart, Icon: Plus, label: "Agregó al carrito", color: "text-cyan-400", bg: "bg-cyan-500/15" },
    { active: activity.hasFormSubmit, Icon: FileText, label: "Formulario", color: "text-ops-green", bg: "bg-ops-green/15" },
    { active: activity.hasInfoRequest, Icon: Info, label: "Info", color: "text-ops-blue-t", bg: "bg-ops-blue/15" },
  ].filter((b) => b.active)

  if (badges.length === 0 && !hasPendingCapi) return <span className="text-ops-tx3 text-xs">—</span>

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
        <span title="CAPI pendiente" className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium bg-ops-amber/15 text-ops-amber">
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <PageShell>
      <nav aria-label="Migas de pan" className="flex items-center gap-1.5 text-[13px] text-ops-tx3">
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-1 rounded text-ops-tx2 hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-ops-blue"
        >
          <ArrowLeft className="h-4 w-4" />
          Campañas
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate text-ops-tx">{campaign.name}</span>
      </nav>

      <PageHeader
        title={campaign.name}
        subtitle={`${campaign.client?.name ?? orgName} · ${leads.length} leads`}
        actions={
          leads.length > 0 ? (
            deleteConfirm === "campaign" ? (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-ops-coral/50 bg-ops-s2 px-3 py-1.5">
                <span className="text-xs text-ops-tx2">¿Eliminar {leads.length} leads de la campaña?</span>
                <button onClick={handleDeleteCampaign} disabled={isPending} className="text-xs font-medium text-ops-coral disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ops-blue">
                  {isPending ? "Eliminando…" : "Confirmar"}
                </button>
                <button onClick={() => setDeleteConfirm(null)} disabled={isPending} className="text-xs text-ops-tx2 hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-ops-blue">
                  Cancelar
                </button>
              </div>
            ) : deleteConfirm === "client" && campaign.clientId ? (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-ops-coral/50 bg-ops-s2 px-3 py-1.5">
                <span className="text-xs text-ops-tx2">¿Eliminar todos los leads del cliente?</span>
                <button onClick={handleDeleteClient} disabled={isPending} className="text-xs font-medium text-ops-coral disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ops-blue">
                  {isPending ? "Eliminando…" : "Confirmar"}
                </button>
                <button onClick={() => setDeleteConfirm(null)} disabled={isPending} className="text-xs text-ops-tx2 hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-ops-blue">
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setDeleteConfirm("campaign")}
                  title="Eliminar todos los leads de esta campaña"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ops-bd px-3 text-xs text-ops-tx2 transition-colors hover:border-ops-bd2 hover:bg-ops-hover hover:text-ops-coral focus-visible:outline-2 focus-visible:outline-ops-blue"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar de campaña
                </button>
                {campaign.clientId && (
                  <button
                    onClick={() => setDeleteConfirm("client")}
                    title="Eliminar todos los leads del cliente (todas las campañas)"
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ops-bd px-3 text-xs text-ops-tx2 transition-colors hover:border-ops-bd2 hover:bg-ops-hover hover:text-ops-coral focus-visible:outline-2 focus-visible:outline-ops-blue"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar de cliente
                  </button>
                )}
              </>
            )
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-ops-line bg-ops-line md:grid-cols-4">
        {[
          { label: "Leads", value: leads.length },
          { label: "Calientes", value: leads.filter((l) => l.temperature === "hot").length },
          { label: "Sin asignar", value: leads.filter((l) => !l.assignedTo).length },
          { label: "Con venta", value: leads.filter((l) => l.saleCount > 0).length },
        ].map((k) => (
          <div key={k.label} className="bg-ops-s1 px-4 py-3">
            <p className="text-xs text-ops-tx3">{k.label}</p>
            <p className="font-plex text-xl font-semibold tabular-nums text-ops-tx">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative w-full md:w-auto">
          <Search aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ops-tx3 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar nombre, email, teléfono…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Buscar lead" className={cn(opsField, "w-full pl-9 md:w-72")}
          />
        </div>

        <select
          value={currentTemp}
          aria-label="Temperatura"
          onChange={(e) => updateFilter("temperature", e.target.value)}
          className={opsField}
        >
          {TEMPERATURES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <select
          value={currentStage}
          aria-label="Etapa"
          onChange={(e) => updateFilter("stage", e.target.value)}
          className={opsField}
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          value={currentSource}
          aria-label="Fuente"
          onChange={(e) => updateFilter("source", e.target.value)}
          className={opsField}
        >
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          value={currentActivity}
          aria-label="Actividad"
          onChange={(e) => updateFilter("activity", e.target.value)}
          className={opsField}
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
          aria-label="Asignación"
          onChange={(e) => updateFilter("assignment", e.target.value)}
          className={opsField}
        >
          <option value="">Asignación</option>
          <option value="unassigned">Sin asignar</option>
          {currentUserId && <option value="mine">Asignados a mí</option>}
        </select>

        {salesReps.length > 0 && (
          <select
            value={currentRepId}
          aria-label="Vendedor"
            onChange={(e) => updateFilter("repId", e.target.value)}
            className={opsField}
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
            className="px-3 py-2 text-xs text-ops-tx3 hover:text-ops-tx transition-colors"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Error */}
      {deleteError && (
        <p className="text-sm text-ops-coral bg-ops-coral/10 border border-ops-coral/40 rounded-lg px-4 py-3">
          {deleteError}
        </p>
      )}

      {/* Bulk selection bar */}
      {selectedLeads.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-ops-s2 border border-ops-bd rounded-lg">
          <span className="text-sm text-ops-tx">
            {selectedLeads.size} lead{selectedLeads.size !== 1 ? "s" : ""} seleccionado{selectedLeads.size !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-3">
            {deleteConfirm === "selected" ? (
              <>
                <span className="text-xs text-ops-tx2">¿Confirmar eliminación?</span>
                <button
                  onClick={handleDeleteSelected}
                  disabled={isPending}
                  className="text-xs text-ops-coral hover:text-ops-coral font-medium disabled:opacity-50"
                >
                  {isPending ? "Eliminando…" : "Eliminar"}
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={isPending}
                  className="text-xs text-ops-tx3 hover:text-ops-tx"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                onClick={() => setDeleteConfirm("selected")}
                className="flex items-center gap-1.5 text-xs text-ops-coral hover:text-ops-coral font-medium"
              >
                <Trash2 className="h-3 w-3" />
                Eliminar seleccionados
              </button>
            )}
            <button
              onClick={() => setSelectedLeads(new Set())}
              className="text-xs text-ops-tx3 hover:text-ops-tx"
            >
              Cancelar selección
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {leads.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="Sin leads todavía"
            text={
              hasFilters
                ? "No hay leads que coincidan con los filtros."
                : "Los leads llegarán cuando configures tu landing page con la API key de esta campaña."
            }
          />
        </Panel>
      ) : (
        <Panel bodyClassName={opsTable.wrap}>
          <table className={cn(opsTable.table, "min-w-[1300px]")}>
            <thead>
              <tr>
                <th className={cn(opsTable.th, "w-10 pl-4 pr-2")}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded border-ops-bd2 bg-ops-s2 accent-ops-blue focus-visible:outline-2 focus-visible:outline-ops-blue"
                  />
                </th>
                <th className={opsTable.th}>Nombre</th>
                <th className={opsTable.th}>Teléfono</th>
                <th className={opsTable.th}>Email</th>
                <th className={opsTable.th}>Temp.</th>
                <th className={opsTable.th}>Etapa</th>
                <th className={opsTable.th}>Venta</th>
                <th className={opsTable.th}>Conjunto</th>
                <th className={opsTable.th}>Anuncio</th>
                <th className={opsTable.th}>Asignado</th>
                <th className={opsTable.th}>Actividad</th>
                <th className={opsTable.th}>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => setDrawerLead(lead)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault()
                      setDrawerLead(lead)
                    }
                  }}
                  className={cn(opsTable.row, "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ops-blue", selectedLeads.has(lead.id) && "bg-ops-sel")}
                >
                  <td className={cn(opsTable.td, "pl-4 pr-2")} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedLeads.has(lead.id)}
                      onChange={(e) => handleSelectLead(lead.id, e.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded border-ops-bd2 bg-ops-s2 accent-ops-blue focus-visible:outline-2 focus-visible:outline-ops-blue"
                    />
                  </td>
                  <td className={opsTable.td}>
                    <div className="flex items-start gap-1.5">
                      <SourceBadge source={lead.leadSource} />
                      <div>
                        <span className="font-medium text-ops-tx">{lead.name}</span>
                        {lead.city && (
                          <span className="block text-xs text-ops-tx3 mt-0.5">{lead.city}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={cn(opsTable.td, "text-ops-tx2 font-plex tabular-nums text-xs")}>
                    {lead.phone ?? <span className="text-ops-tx3">—</span>}
                  </td>
                  <td className={cn(opsTable.td, "text-ops-tx2 text-xs max-w-[180px] truncate")}>
                    {lead.email ?? <span className="text-ops-tx3">—</span>}
                  </td>
                  <td className={opsTable.td}>
                    <StatusChip tone={tempTone(lead.temperature)}>{tempLabel(lead.temperature)}</StatusChip>
                  </td>
                  <td className={opsTable.td}>
                    <StatusChip tone={stageTone(lead.stage)}>{stageLabel(lead.stage)}</StatusChip>
                  </td>
                  <td className={opsTable.td}>
                    {lead.saleCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-ops-green/15 text-ops-green">
                        <BadgeDollarSign className="h-3 w-3" />
                        {lead.saleTotalAmount
                          ? formatMoney(lead.saleTotalAmount, lead.saleCurrency ?? "USD")
                          : `${lead.saleCount} ${lead.saleCount === 1 ? "venta" : "ventas"}`}
                        {lead.saleCount > 1 && lead.saleTotalAmount && (
                          <span className="opacity-60">·{lead.saleCount}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-ops-tx3 text-xs">—</span>
                    )}
                  </td>
                  <td className={cn(opsTable.td, "text-xs max-w-[160px] truncate")}>
                    {lead.metaAdsetName
                      ? <span className="text-ops-blue-t/80">{lead.metaAdsetName}</span>
                      : <span className="text-ops-tx3">—</span>}
                  </td>
                  <td className={cn(opsTable.td, "text-xs max-w-[160px] truncate")}>
                    {lead.metaAdName
                      ? <span className="text-ops-tx">{lead.metaAdName}</span>
                      : <span className="text-ops-tx3">—</span>}
                  </td>
                  <td className={cn(opsTable.td, "text-xs max-w-[120px] truncate")}>
                    {lead.assignedTo
                      ? <span className="text-ops-tx">{lead.assignedTo}</span>
                      : <span className="text-ops-tx3">—</span>}
                  </td>
                  <td className={opsTable.td}>
                    <ActivityBadges activity={lead.activity} hasPendingCapi={lead.hasPendingCapi} />
                  </td>
                  <td className={cn(opsTable.td, "text-ops-tx3 text-xs whitespace-nowrap")}>
                    {formatDate(lead.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
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
      <p className="text-xs text-ops-tx3">
        Abrir WhatsApp abre la conversación; no envía ningún mensaje por ti.
      </p>
    </PageShell>
  )
}

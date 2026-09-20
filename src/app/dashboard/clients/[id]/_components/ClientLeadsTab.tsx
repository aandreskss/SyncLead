"use client"

import { useState, useEffect, useTransition, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, Users, BadgeDollarSign } from "lucide-react"
import { LeadDrawer } from "@/app/dashboard/campaigns/[id]/leads/_components/LeadDrawer"
import type { Temperature, LeadStage, SalesRep } from "@/lib/db/schema"
import type { LeadWithActivity } from "@/domains/leads/repository"

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
  const [, startTransition] = useTransition()
  const mutated = useRef(false)

  const [searchInput, setSearchInput] = useState(filters.search)
  const [drawerLead, setDrawerLead] = useState<LeadWithActivity | null>(null)

  // KPI stats — computed from local leads array (already filtered by server)
  const hotCount = leads.filter((l) => l.temperature === "hot").length
  const convertedCount = leads.filter((l) => l.saleCount > 0).length
  const contactedCount = leads.filter((l) => l.stage !== "new").length

  // Campaign name lookup
  const campaignMap = Object.fromEntries(campaigns.map((c) => [c.id, c.name]))

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    // preserve tab=leads
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

  const hasActiveFilters =
    filters.search || filters.temperature || filters.stage || filters.campaignId || filters.converted

  return (
    <div className="space-y-6">
      {/* KPI row — Total, Calientes, Con venta, Contactados */}
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
          <table className="w-full text-sm min-w-[1200px]">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Nombre</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Teléfono</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Email</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Temp.</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Etapa</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Venta</th>
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
                  className="hover:bg-zinc-800/40 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {lead.saleCount > 0 && (
                        <span className="text-emerald-400 text-xs" title="Comprador">$</span>
                      )}
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
            router.refresh()
          } else {
            router.refresh()
          }
        }}
        onMutated={() => { mutated.current = true }}
        whatsappNumbers={whatsappNumbers}
        clientId={clientId}
        salesReps={salesReps}
      />
    </div>
  )
}

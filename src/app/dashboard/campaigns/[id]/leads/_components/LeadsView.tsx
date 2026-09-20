"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Search, Users } from "lucide-react"
import { LeadDrawer } from "./LeadDrawer"
import type { Lead, Campaign, Client, Temperature, LeadStage, SalesRep } from "@/lib/db/schema"

interface Props {
  leads: Lead[]
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

export function LeadsView({ leads, campaign, whatsappNumbers, orgName, salesReps = [], currentUserId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const currentSearch = searchParams.get("search") ?? ""
  const currentTemp = searchParams.get("temperature") ?? ""
  const currentStage = searchParams.get("stage") ?? ""
  const currentAssignment = searchParams.get("assignment") ?? ""
  const currentRepId = searchParams.get("repId") ?? ""

  const [searchInput, setSearchInput] = useState(currentSearch)
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null)

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

        {(currentSearch || currentTemp || currentStage || currentAssignment || currentRepId) && (
          <button
            onClick={() => {
              setSearchInput("")
              const params = new URLSearchParams()
              router.push(`?${params.toString()}`)
            }}
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
          <p className="text-zinc-300 font-medium">Sin leads todavía</p>
          <p className="text-zinc-500 text-sm mt-1 max-w-xs">
            {currentSearch || currentTemp || currentStage
              ? "No hay leads que coincidan con los filtros."
              : "Los leads llegarán cuando configures tu landing page con la API key de esta campaña."}
          </p>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Nombre</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Teléfono</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Email</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Temp.</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Etapa</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Negocio</th>
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
                    <span className="font-medium text-zinc-100">{lead.name}</span>
                    {lead.city && (
                      <span className="block text-xs text-zinc-500 mt-0.5">{lead.city}</span>
                    )}
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
                  <td className="px-4 py-3 text-center">
                    {lead.negocio ? (
                      <span className="text-emerald-400 text-xs font-medium">Sí</span>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
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
          router.refresh()
        }}
        whatsappNumbers={whatsappNumbers}
        clientId={campaign.clientId ?? undefined}
        salesReps={salesReps}
      />
    </div>
  )
}

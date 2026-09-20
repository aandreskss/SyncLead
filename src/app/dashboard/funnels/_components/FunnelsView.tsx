"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, Pencil, Trash2, GitMerge } from "lucide-react"
import { deleteFunnelAction } from "@/domains/funnels/actions"
import { FunnelDialog } from "./FunnelDialog"
import { KanbanBoard } from "./KanbanBoard"
import type { Funnel, SalesRep } from "@/lib/db/schema"
import type { LeadWithActivity } from "@/domains/leads/repository"

interface Props {
  funnels: Funnel[]
  selectedFunnel: Funnel | null
  leads: LeadWithActivity[]
  campaignOptions: { id: string; name: string }[]
  filters: { campaignId: string; temperature: string; assignedTo: string }
  salesReps?: SalesRep[]
  whatsappNumbers?: string[]
  clientId?: string
}

const TEMPS = [
  { value: "", label: "Temperatura" },
  { value: "hot", label: "Caliente" },
  { value: "warm", label: "Tibio" },
  { value: "cold", label: "Frío" },
]

const UNIQUE_ASSIGNEES = (leads: LeadWithActivity[]) =>
  [...new Set(leads.map((l) => l.assignedTo).filter(Boolean) as string[])]

export function FunnelsView({
  funnels,
  selectedFunnel,
  leads,
  campaignOptions,
  filters,
  salesReps,
  whatsappNumbers,
  clientId,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editFunnel, setEditFunnel] = useState<Funnel | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletePending, startDelete] = useTransition()

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    startTransition(() => router.push(`?${params}`))
  }

  function selectFunnel(id: string) {
    const params = new URLSearchParams()
    params.set("funnelId", id)
    startTransition(() => router.push(`?${params}`))
  }

  function openCreate() {
    setEditFunnel(null)
    setDialogOpen(true)
  }

  function openEdit(f: Funnel) {
    setEditFunnel(f)
    setDialogOpen(true)
  }

  function handleDelete(id: string) {
    startDelete(async () => {
      await deleteFunnelAction(id)
      setConfirmDeleteId(null)
      router.refresh()
    })
  }

  function handleDialogSuccess(funnelId: string) {
    router.refresh()
    selectFunnel(funnelId)
  }

  const assignees = UNIQUE_ASSIGNEES(leads)

  // ── Empty state ───────────────────────────────────────────────────────────────
  if (funnels.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-zinc-100">Embudos</h1>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Crear embudo
          </button>
        </div>

        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-14 w-14 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
            <GitMerge className="h-7 w-7 text-zinc-500" />
          </div>
          <p className="text-zinc-300 font-medium">Sin embudos todavía</p>
          <p className="text-zinc-500 text-sm mt-1 max-w-xs">
            Crea un embudo para visualizar tus leads en un tablero kanban con las etapas que definas.
          </p>
          <button
            onClick={openCreate}
            className="mt-5 flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Crear primer embudo
          </button>
        </div>

        <FunnelDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          funnel={editFunnel}
          onSuccess={handleDialogSuccess}
        />
      </div>
    )
  }

  // ── Main view ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-zinc-100">Embudos</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo embudo
        </button>
      </div>

      {/* Funnel tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
        {funnels.map((f) => (
          <div key={f.id} className="relative flex items-center group">
            <button
              onClick={() => selectFunnel(f.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedFunnel?.id === f.id
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              }`}
            >
              {f.name}
            </button>

            {/* Edit / Delete actions visible on hover */}
            <div className="ml-0.5 hidden group-hover:flex items-center gap-0.5">
              <button
                onClick={() => openEdit(f)}
                className="p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                title="Editar"
              >
                <Pencil className="h-3 w-3" />
              </button>
              {confirmDeleteId === f.id ? (
                <>
                  <button
                    onClick={() => handleDelete(f.id)}
                    disabled={deletePending}
                    className="text-xs px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    {deletePending ? "…" : "Sí"}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
                  >
                    No
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(f.id)}
                  className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.campaignId}
          onChange={(e) => updateParam("campaignId", e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
        >
          <option value="">Todas las campañas</option>
          {campaignOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={filters.temperature}
          onChange={(e) => updateParam("temperature", e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
        >
          {TEMPS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        {assignees.length > 0 && (
          <select
            value={filters.assignedTo}
            onChange={(e) => updateParam("assignedTo", e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="">Todos los asignados</option>
            {assignees.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        )}

        {(filters.campaignId || filters.temperature || filters.assignedTo) && (
          <button
            onClick={() => {
              const params = new URLSearchParams()
              if (selectedFunnel) params.set("funnelId", selectedFunnel.id)
              router.push(`?${params}`)
            }}
            className="text-xs text-zinc-500 hover:text-zinc-300 px-2 transition-colors"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Lead count hint */}
      {leads.length === 500 && (
        <p className="text-xs text-amber-400">
          Mostrando los primeros 500 leads. Usa filtros para acotar la vista.
        </p>
      )}

      {/* Kanban */}
      {selectedFunnel ? (
        <KanbanBoard
          funnel={selectedFunnel}
          initialLeads={leads}
          salesReps={salesReps}
          whatsappNumbers={whatsappNumbers}
          clientId={clientId}
        />
      ) : (
        <div className="text-center py-12 text-zinc-600 text-sm">
          Selecciona un embudo para ver el kanban.
        </div>
      )}

      <FunnelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        funnel={editFunnel}
        onSuccess={handleDialogSuccess}
      />
    </div>
  )
}

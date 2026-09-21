"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, Pencil, Trash2, GitMerge } from "lucide-react"
import { deleteFunnelAction } from "@/domains/funnels/actions"
import { PageShell, PageHeader, Panel, EmptyState, opsField, opsIconBtn } from "@/components/app/ops"
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
      <PageShell>
        <PageHeader
          title="Funnels"
          subtitle="Mueve cada lead por las etapas de tu proceso comercial."
          actions={
            <button onClick={openCreate} className="inline-flex h-9 items-center gap-2 rounded-md bg-ops-blue px-4 text-[13px] font-medium text-white transition-colors hover:bg-ops-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue">
              <Plus className="h-4 w-4" />
              Crear embudo
            </button>
          }
        />
        <Panel>
          <EmptyState
            icon={<GitMerge className="h-5 w-5" />}
            title="Sin embudos todavía"
            text="Crea un embudo para visualizar tus leads en un tablero kanban con las etapas que definas."
            action={
              <button onClick={openCreate} className="mt-2 inline-flex h-9 items-center gap-2 rounded-md bg-ops-blue px-4 text-[13px] font-medium text-white transition-colors hover:bg-ops-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue">
                <Plus className="h-4 w-4" />
                Crear primer embudo
              </button>
            }
          />
        </Panel>

        <FunnelDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          funnel={editFunnel}
          onSuccess={handleDialogSuccess}
        />
      </PageShell>
    )
  }

  // ── Main view ─────────────────────────────────────────────────────────────────
  return (
    <PageShell className="space-y-4">
      <PageHeader
        title="Funnels"
        subtitle="Mueve cada lead por las etapas de tu proceso comercial."
        actions={
          <button onClick={openCreate} className="inline-flex h-9 items-center gap-2 rounded-md bg-ops-blue px-4 text-[13px] font-medium text-white transition-colors hover:bg-ops-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue">
            <Plus className="h-4 w-4" />
            Nuevo embudo
          </button>
        }
      />

      {/* Funnel tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ops-line pb-3">
        {funnels.map((f) => (
          <div key={f.id} className="relative flex items-center group">
            <button
              onClick={() => selectFunnel(f.id)}
              className={`h-8 rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ops-blue ${
                selectedFunnel?.id === f.id
                  ? "bg-ops-sel text-ops-tx shadow-[inset_0_-2px_0_var(--color-ops-blue)]"
                  : "text-ops-tx2 hover:text-ops-tx hover:bg-ops-hover"
              }`}
            >
              {f.name}
            </button>

            {/* Edit / Delete actions visible on hover */}
            <div className="ml-0.5 hidden group-hover:flex group-focus-within:flex items-center gap-0.5">
              <button
                onClick={() => openEdit(f)}
                className={opsIconBtn}
                title="Editar"
                aria-label="Editar embudo"
              >
                <Pencil className="h-3 w-3" />
              </button>
              {confirmDeleteId === f.id ? (
                <>
                  <button
                    onClick={() => handleDelete(f.id)}
                    disabled={deletePending}
                    className="h-7 rounded-md bg-ops-coral px-2 text-xs font-medium text-ops-bg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ops-blue"
                  >
                    {deletePending ? "…" : "Sí"}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="h-7 rounded-md border border-ops-bd px-2 text-xs text-ops-tx hover:bg-ops-hover focus-visible:outline-2 focus-visible:outline-ops-blue"
                  >
                    No
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(f.id)}
                  className={`${opsIconBtn} hover:text-ops-coral`}
                  title="Eliminar"
                  aria-label="Eliminar embudo"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Campaña"
          value={filters.campaignId}
          onChange={(e) => updateParam("campaignId", e.target.value)}
          className={opsField}
        >
          <option value="">Todas las campañas</option>
          {campaignOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          aria-label="Temperatura"
          value={filters.temperature}
          onChange={(e) => updateParam("temperature", e.target.value)}
          className={opsField}
        >
          {TEMPS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        {assignees.length > 0 && (
          <select
            aria-label="Asignado"
            value={filters.assignedTo}
            onChange={(e) => updateParam("assignedTo", e.target.value)}
            className={opsField}
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
            className="h-9 px-2 text-xs text-ops-tx2 hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-ops-blue"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Lead count hint */}
      {leads.length === 500 && (
        <p className="text-xs text-ops-amber">
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
        <div className="py-12 text-center text-sm text-ops-tx3">
          Selecciona un embudo para ver el kanban.
        </div>
      )}

      <FunnelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        funnel={editFunnel}
        onSuccess={handleDialogSuccess}
      />
    </PageShell>
  )
}

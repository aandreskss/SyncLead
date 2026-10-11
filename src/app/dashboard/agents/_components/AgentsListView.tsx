"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Bot, Copy, Plus, Archive, Pencil, MoreHorizontal, Phone } from "lucide-react"
import { PageHeader, Panel, EmptyState, StatusChip, opsBtnPrimary, opsBtnSecondary } from "@/components/app/ops"
import { AGENT_TEMPLATE_LIST } from "@/domains/ai-agents/templates"
import {
  createAgentFromTemplateAction,
  createBlankAgentAction,
  duplicateAgentAction,
  archiveAgentAction,
} from "@/domains/ai-agents/actions"
import { cn } from "@/lib/utils"

type AgentRow = {
  id: string
  name: string
  description: string | null
  status: string
  updatedAt: Date
  associatedPhones: Array<{ id: string; displayPhoneNumber: string; verifiedName: string | null } | undefined>
}

interface Props {
  agents: AgentRow[]
  canManage: boolean
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  active: "Activo",
  paused: "Pausado",
  archived: "Archivado",
}

const STATUS_TONE: Record<string, "neutral" | "green" | "amber" | "coral"> = {
  draft: "neutral",
  active: "green",
  paused: "amber",
  archived: "coral",
}

function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d
  return date.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })
}

export default function AgentsListView({ agents, canManage }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showCreate, setShowCreate] = useState(false)
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)

  function handleCreate(templateId: string | null) {
    setShowCreate(false)
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        const name = templateId
          ? (AGENT_TEMPLATE_LIST.find(t => t.id === templateId)?.name ?? "Nuevo agente") + " (copia)"
          : "Nuevo agente"
        fd.set("name", name)
        if (templateId) {
          fd.set("templateId", templateId)
          const res = await createAgentFromTemplateAction(fd)
          if (!res.success) { setError(res.error); return }
          router.push(`/dashboard/agents/${res.agentId}`)
        } else {
          const res = await createBlankAgentAction(fd)
          if (!res.success) { setError(res.error); return }
          router.push(`/dashboard/agents/${res.agentId}`)
        }
      } catch {
        setError("Error inesperado al crear el agente")
      }
    })
  }

  function handleDuplicate(agentId: string, agentName: string) {
    setActiveMenu(null)
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set("sourceAgentId", agentId)
        fd.set("name", `${agentName} (copia)`)
        const res = await duplicateAgentAction(fd)
        if (!res.success) { setError(res.error); return }
        router.push(`/dashboard/agents/${res.agentId}`)
        router.refresh()
      } catch {
        setError("Error inesperado al duplicar")
      }
    })
  }

  function handleArchive(agentId: string) {
    setArchiveConfirmId(null)
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set("agentId", agentId)
        const res = await archiveAgentAction(fd)
        if (!res.success) { setError(res.error); return }
        router.refresh()
      } catch {
        setError("Error inesperado al archivar")
      }
    })
  }

  return (
    <>
      <PageHeader
        eyebrow="AGENTES IA"
        title="Mis Agentes"
        subtitle="Crea y gestiona los agentes de WhatsApp que atienden leads de forma automática."
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className={opsBtnPrimary}
              disabled={isPending}
            >
              <Plus className="h-4 w-4" />
              Nuevo agente
            </button>
          ) : null
        }
      />

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {agents.length === 0 ? (
        <EmptyState
          icon={<Bot className="h-6 w-6" />}
          title="Aún no tienes agentes"
          text="Crea tu primer agente IA para automatizar la atención de leads por WhatsApp."
          action={
            canManage ? (
              <button type="button" onClick={() => setShowCreate(true)} className={opsBtnPrimary}>
                <Plus className="h-4 w-4" />
                Nuevo agente
              </button>
            ) : undefined
          }
        />
      ) : (
        <Panel bodyClassName="divide-y divide-ops-line">
          {agents.map(agent => {
            const phones = agent.associatedPhones.filter(Boolean)
            return (
              <div key={agent.id} className="group flex items-start gap-3 px-5 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ops-blue-bg text-ops-blue">
                  <Bot className="h-5 w-5" aria-hidden="true" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ops-tx">{agent.name}</span>
                    <StatusChip tone={STATUS_TONE[agent.status] ?? "neutral"}>
                      {STATUS_LABELS[agent.status] ?? agent.status}
                    </StatusChip>
                  </div>

                  {agent.description && (
                    <p className="mt-0.5 text-xs text-ops-tx2 line-clamp-1">{agent.description}</p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ops-tx3">
                    {phones.length > 0 ? (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" aria-hidden="true" />
                        {phones.map(p => p?.displayPhoneNumber).join(", ")}
                      </span>
                    ) : (
                      <span className="text-ops-tx3">Sin número asignado</span>
                    )}
                    <span>Actualizado {formatDate(agent.updatedAt)}</span>
                  </div>
                </div>

                {canManage && (
                  <div className="relative flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
                      className={cn(opsBtnSecondary, "h-8 px-3 text-xs")}
                      aria-label={`Editar ${agent.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveMenu(activeMenu === agent.id ? null : agent.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-ops-bd text-ops-tx2 hover:bg-ops-hover"
                      aria-label="Más acciones"
                      aria-expanded={activeMenu === agent.id}
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </button>

                    {activeMenu === agent.id && (
                      <div
                        className="absolute right-0 top-10 z-20 min-w-[160px] rounded-xl border border-ops-line bg-ops-s1 py-1 shadow-ops-card"
                        role="menu"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => handleDuplicate(agent.id, agent.name)}
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ops-tx hover:bg-ops-hover"
                          disabled={isPending}
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                          Duplicar
                        </button>

                        {archiveConfirmId === agent.id ? (
                          <div className="px-4 py-2">
                            <p className="mb-2 text-xs text-ops-tx2">¿Confirmar archivo?</p>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleArchive(agent.id)}
                                className="rounded-full bg-red-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                                disabled={isPending}
                              >
                                Archivar
                              </button>
                              <button
                                type="button"
                                onClick={() => { setArchiveConfirmId(null); setActiveMenu(null) }}
                                className="rounded-full border border-ops-bd px-3 py-1 text-xs text-ops-tx2"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => setArchiveConfirmId(agent.id)}
                            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-ops-hover"
                          >
                            <Archive className="h-4 w-4" aria-hidden="true" />
                            Archivar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </Panel>
      )}

      {/* Overlay to close menu */}
      {activeMenu && (
        <div
          className="fixed inset-0 z-10"
          aria-hidden="true"
          onClick={() => { setActiveMenu(null); setArchiveConfirmId(null) }}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Crear nuevo agente"
        >
          <div className="w-full max-w-lg rounded-[20px] border border-ops-line bg-ops-s1 p-6 shadow-ops-card">
            <h2 className="mb-1 text-lg font-semibold text-ops-tx">Nuevo agente</h2>
            <p className="mb-5 text-sm text-ops-tx2">Elige una plantilla o empieza desde cero.</p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleCreate(null)}
                disabled={isPending}
                className="flex w-full items-start gap-3 rounded-xl border border-ops-line p-3.5 text-left hover:border-ops-blue hover:bg-ops-blue-bg disabled:opacity-50 transition-colors"
              >
                <Plus className="mt-0.5 h-5 w-5 shrink-0 text-ops-blue" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-ops-tx">Desde cero</p>
                  <p className="text-xs text-ops-tx2">Configura todas las opciones manualmente.</p>
                </div>
              </button>

              {AGENT_TEMPLATE_LIST.map(template => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => handleCreate(template.id)}
                  disabled={isPending}
                  className="flex w-full items-start gap-3 rounded-xl border border-ops-line p-3.5 text-left hover:border-ops-blue hover:bg-ops-blue-bg disabled:opacity-50 transition-colors"
                >
                  <Bot className="mt-0.5 h-5 w-5 shrink-0 text-ops-blue" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-ops-tx">{template.name}</p>
                    <p className="text-xs text-ops-tx2">{template.description}</p>
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className={cn(opsBtnSecondary, "mt-5 w-full")}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  )
}

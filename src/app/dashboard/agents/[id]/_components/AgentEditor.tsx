"use client"

import { useState, useTransition, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, BookOpen, Bot, ChevronDown, ChevronUp, Cpu, Rocket, Save, Send, Settings2, Shield } from "lucide-react"
import { PageHeader, Panel, opsBtnPrimary, opsBtnSecondary, StatusChip } from "@/components/app/ops"
import { saveAgentDraftAction, publishAgentConfigAction, revertToVersionAction } from "@/domains/ai-agents/actions"
import type { AgentConfig } from "@/domains/ai-agents/types"
import { cn } from "@/lib/utils"
import TabObjetivo from "./TabObjetivo"
import TabPersonalidad from "./TabPersonalidad"
import TabConocimiento from "./TabConocimiento"
import TabAcciones from "./TabAcciones"
import TabReglas from "./TabReglas"
import TabDespliegue from "./TabDespliegue"

const TABS = [
  { id: "objetivo", label: "Objetivo", icon: Rocket },
  { id: "personalidad", label: "Personalidad", icon: Bot },
  { id: "conocimiento", label: "Conocimiento", icon: BookOpen },
  { id: "acciones", label: "Acciones", icon: Cpu },
  { id: "reglas", label: "Reglas y salidas", icon: Shield },
  { id: "despliegue", label: "Despliegue", icon: Settings2 },
] as const

type TabId = typeof TABS[number]["id"]

const STATUS_LABELS: Record<string, string> = { draft: "Borrador", active: "Activo", paused: "Pausado", archived: "Archivado" }
const STATUS_TONE: Record<string, "neutral" | "green" | "amber" | "coral"> = {
  draft: "neutral", active: "green", paused: "amber", archived: "coral",
}

function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d
  return date.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

interface AgentRow {
  id: string
  name: string
  description: string | null
  status: string
  updatedAt: Date
  agentConfig: AgentConfig
}

interface VersionRow {
  id: string
  versionNumber: number
  status: string
  publishedAt: Date | null
  archivedAt: Date | null
}

interface PhoneRow {
  id: string
  displayPhoneNumber: string
  verifiedName: string | null
  status: string
}

interface KnowledgeRow {
  id: string
  name: string
  sourceType: string
  status: string
}

interface CampaignRow {
  id: string
  name: string
  clientName: string
}

interface DeploymentData {
  id: string
  paused: boolean
  scheduleTimezone: string | null
  scheduleWindows: Record<string, Array<{ start: string; end: string }>> | null
  scheduleEnabled: boolean | null
}

interface Props {
  orgId: string
  agent: AgentRow
  versions: VersionRow[]
  phoneNumbers: PhoneRow[]
  knowledgeSources: KnowledgeRow[]
  campaigns: CampaignRow[]
  canManage: boolean
  deployment: DeploymentData | null
}

export default function AgentEditor({ orgId, agent, versions, phoneNumbers, knowledgeSources, campaigns, canManage, deployment }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<TabId>("objetivo")
  const [config, setConfig] = useState<AgentConfig>(agent.agentConfig)
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description ?? "")
  const [isDirty, setIsDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showVersions, setShowVersions] = useState(false)

  const updateConfig = useCallback(<K extends keyof AgentConfig>(tab: K, value: AgentConfig[K]) => {
    setConfig(prev => ({ ...prev, [tab]: value }))
    setIsDirty(true)
    setError(null)
    setSuccess(null)
  }, [])

  function handleSaveDraft() {
    if (!canManage) return
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      try {
        const res = await saveAgentDraftAction({ agentId: agent.id, config, name, description: description || undefined })
        if (!res.success) { setError(res.error); return }
        setIsDirty(false)
        setSuccess("Borrador guardado correctamente.")
        router.refresh()
      } catch {
        setError("Error inesperado al guardar")
      }
    })
  }

  function handlePublish() {
    if (!canManage) return
    // Save draft first, then publish
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      try {
        // Save latest changes
        const saveRes = await saveAgentDraftAction({ agentId: agent.id, config, name, description: description || undefined })
        if (!saveRes.success) { setError(saveRes.error); return }

        const fd = new FormData()
        fd.set("agentId", agent.id)
        const pubRes = await publishAgentConfigAction(fd)
        if (!pubRes.success) { setError(pubRes.error); return }

        setIsDirty(false)
        setSuccess(`Versión ${pubRes.versionNumber} publicada correctamente.`)
        router.refresh()
      } catch {
        setError("Error inesperado al publicar")
      }
    })
  }

  function handleRevert(versionId: string) {
    if (!canManage) return
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set("versionId", versionId)
        const res = await revertToVersionAction(fd)
        if (!res.success) { setError(res.error); return }
        setSuccess("Configuración revertida a la versión anterior. Recarga para continuar editando.")
        router.refresh()
      } catch {
        setError("Error inesperado al revertir")
      }
    })
  }

  const isArchived = agent.status === "archived"

  return (
    <>
      {/* Header */}
      <PageHeader
        eyebrow="AGENTES IA"
        title={
          <span className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/dashboard/agents")}
              className="rounded-full p-1 text-ops-tx2 hover:bg-ops-hover"
              aria-label="Volver a la lista"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            {canManage && !isArchived ? (
              <input
                value={name}
                onChange={e => { setName(e.target.value); setIsDirty(true) }}
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent text-[22px] font-semibold text-ops-tx focus:border-ops-bd focus:bg-ops-s2 focus:outline-none px-2 -mx-2"
                aria-label="Nombre del agente"
              />
            ) : name}
            <StatusChip tone={STATUS_TONE[agent.status] ?? "neutral"}>{STATUS_LABELS[agent.status] ?? agent.status}</StatusChip>
            {isDirty && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                Sin guardar
              </span>
            )}
          </span>
        }
        subtitle={
          canManage && !isArchived ? (
            <input
              value={description}
              onChange={e => { setDescription(e.target.value); setIsDirty(true) }}
              placeholder="Descripción opcional"
              className="mt-1 w-full rounded-lg border border-transparent bg-transparent text-sm text-ops-tx2 focus:border-ops-bd focus:bg-ops-s2 focus:outline-none px-1 -mx-1"
            />
          ) : description || undefined
        }
        actions={
          canManage && !isArchived ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={isPending || !isDirty}
                className={cn(opsBtnSecondary, "h-9 px-4 text-sm disabled:opacity-50")}
              >
                <Save className="h-4 w-4" />
                Guardar borrador
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={isPending}
                className={cn(opsBtnPrimary, "h-9 px-4 text-sm disabled:opacity-50")}
              >
                <Send className="h-4 w-4" />
                Publicar versión
              </button>
            </div>
          ) : null
        }
      />

      {/* Alerts */}
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}
      {isArchived && (
        <div className="rounded-xl border border-ops-amber bg-ops-amber-bg px-4 py-3 text-sm text-ops-tx">
          Este agente está archivado y no puede editarse. Duplica el agente para crear una nueva versión editable.
        </div>
      )}

      {/* Version history accordion */}
      {versions.length > 0 && (
        <Panel bodyClassName="">
          <button
            type="button"
            onClick={() => setShowVersions(v => !v)}
            className="flex w-full items-center justify-between px-5 py-3 text-sm text-ops-tx2 hover:text-ops-tx"
            aria-expanded={showVersions}
          >
            <span className="font-medium">Historial de versiones ({versions.length})</span>
            {showVersions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showVersions && (
            <div className="divide-y divide-ops-line border-t border-ops-line">
              {versions.map(v => (
                <div key={v.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <span className="text-sm font-medium text-ops-tx">v{v.versionNumber}</span>
                    <span className="ml-2 inline-flex">
                      <StatusChip tone={v.status === "published" ? "green" : v.status === "archived" ? "neutral" : "amber"}>
                        {v.status === "published" ? "Publicada" : v.status === "archived" ? "Archivada" : "Borrador"}
                      </StatusChip>
                    </span>
                    {v.publishedAt && (
                      <span className="ml-2 text-xs text-ops-tx3">{formatDate(v.publishedAt)}</span>
                    )}
                  </div>
                  {canManage && !isArchived && v.status === "archived" && (
                    <button
                      type="button"
                      onClick={() => handleRevert(v.id)}
                      disabled={isPending}
                      className={cn(opsBtnSecondary, "h-7 px-3 text-xs disabled:opacity-50")}
                    >
                      Revertir a esta
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* Tab navigation */}
      <div className="flex overflow-x-auto rounded-full bg-ops-s2 p-1 gap-1" role="tablist" aria-label="Secciones del agente">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors duration-150",
                activeTab === tab.id
                  ? "bg-ops-s1 text-ops-tx shadow-ops-card"
                  : "text-ops-tx2 hover:text-ops-tx"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab panels */}
      <div role="tabpanel">
        {activeTab === "objetivo" && (
          <TabObjetivo
            config={config.objetivo}
            onChange={v => updateConfig("objetivo", v)}
            readOnly={isArchived || !canManage}
          />
        )}
        {activeTab === "personalidad" && (
          <TabPersonalidad
            config={config.personalidad}
            onChange={v => updateConfig("personalidad", v)}
            readOnly={isArchived || !canManage}
          />
        )}
        {activeTab === "conocimiento" && (
          <TabConocimiento
            orgId={orgId}
            config={config.conocimiento}
            knowledgeSources={knowledgeSources}
            onChange={v => updateConfig("conocimiento", v)}
            readOnly={isArchived || !canManage}
          />
        )}
        {activeTab === "acciones" && (
          <TabAcciones
            config={config.acciones}
            onChange={v => updateConfig("acciones", v)}
            readOnly={isArchived || !canManage}
          />
        )}
        {activeTab === "reglas" && (
          <TabReglas
            config={config.reglas}
            onChange={v => updateConfig("reglas", v)}
            readOnly={isArchived || !canManage}
          />
        )}
        {activeTab === "despliegue" && (
          <TabDespliegue
            config={config.despliegue}
            phoneNumbers={phoneNumbers}
            campaigns={campaigns}
            onChange={v => updateConfig("despliegue", v)}
            readOnly={isArchived || !canManage}
            deployment={deployment}
          />
        )}
      </div>
    </>
  )
}

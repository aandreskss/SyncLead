"use client"

import { Panel } from "@/components/app/ops"
import type { AgentAccionesConfig, AgentActionConfig } from "@/domains/ai-agents/types"
import { cn } from "@/lib/utils"

interface Props {
  config: AgentAccionesConfig
  onChange: (v: AgentAccionesConfig) => void
  readOnly: boolean
}

// Predefined set of possible agent actions
const AVAILABLE_ACTIONS: Array<{
  id: string
  label: string
  description: string
  resources?: Array<{ id: string; label: string }>
}> = [
  {
    id: "update_lead_stage",
    label: "Actualizar etapa del lead",
    description: "El agente puede cambiar la etapa del lead en el CRM (ej: de nuevo a contactado).",
  },
  {
    id: "add_lead_note",
    label: "Agregar nota al lead",
    description: "El agente puede registrar notas y observaciones en el perfil del lead.",
  },
  {
    id: "assign_to_rep",
    label: "Asignar a un vendedor",
    description: "El agente puede asignar el lead a un miembro del equipo de ventas.",
  },
  {
    id: "create_appointment_request",
    label: "Crear solicitud de cita",
    description: "El agente registra una solicitud de cita. El equipo confirma disponibilidad por separado.",
  },
  {
    id: "search_knowledge_base",
    label: "Buscar en base de conocimiento",
    description: "El agente puede consultar documentos y fuentes de conocimiento habilitadas.",
  },
  {
    id: "send_product_info",
    label: "Enviar información de producto",
    description: "El agente puede enviar fichas o catálogos de productos autorizados.",
    resources: [
      { id: "catalog_general", label: "Catálogo general" },
      { id: "pricing_sheet", label: "Lista de precios" },
    ],
  },
  {
    id: "notify_team",
    label: "Notificar al equipo",
    description: "El agente puede enviar alertas internas al equipo cuando se cumple una condición.",
  },
]

export default function TabAcciones({ config, onChange, readOnly }: Props) {
  function toggleAction(actionId: string, enabled: boolean) {
    const current = config.actions[actionId] ?? { enabled: false }
    onChange({
      ...config,
      actions: {
        ...config.actions,
        [actionId]: { ...current, enabled },
      },
    })
  }

  function toggleResource(actionId: string, resourceId: string, enabled: boolean) {
    const current = config.actions[actionId] ?? { enabled: true }
    const currentResources = current.allowedResources ?? []
    const next = enabled
      ? [...currentResources, resourceId]
      : currentResources.filter(r => r !== resourceId)
    onChange({
      ...config,
      actions: {
        ...config.actions,
        [actionId]: { ...current, allowedResources: next },
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ops-amber bg-ops-amber-bg px-4 py-3">
        <p className="text-sm text-ops-tx">
          <strong>Principio de mínimo privilegio:</strong> Habilita únicamente las acciones que el agente realmente necesita para su objetivo. Las acciones desactivadas no están disponibles para el modelo.
        </p>
      </div>

      <Panel bodyClassName="divide-y divide-ops-line">
        {AVAILABLE_ACTIONS.map(action => {
          const actionConfig: AgentActionConfig = config.actions[action.id] ?? { enabled: false }
          const isEnabled = actionConfig.enabled

          return (
            <div key={action.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ops-tx">{action.label}</p>
                  <p className="mt-0.5 text-xs text-ops-tx2">{action.description}</p>
                </div>
                <label className="relative flex cursor-pointer items-center" aria-label={`${action.label}: ${isEnabled ? "activado" : "desactivado"}`}>
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={e => !readOnly && toggleAction(action.id, e.target.checked)}
                    disabled={readOnly}
                    className="sr-only peer"
                  />
                  <div className={cn(
                    "relative h-5 w-9 rounded-full border transition-colors duration-200",
                    isEnabled ? "border-ops-blue bg-ops-blue" : "border-ops-bd bg-ops-s2",
                    readOnly ? "cursor-default" : "cursor-pointer"
                  )}>
                    <span className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                      isEnabled ? "translate-x-4" : "translate-x-0.5"
                    )} />
                  </div>
                </label>
              </div>

              {isEnabled && action.resources && action.resources.length > 0 && (
                <div className="mt-3 ml-0 space-y-1.5 rounded-xl bg-ops-s2 p-3">
                  <p className="text-xs font-semibold text-ops-tx3 uppercase tracking-wide">Recursos permitidos</p>
                  {action.resources.map(resource => {
                    const allowed = (actionConfig.allowedResources ?? []).includes(resource.id)
                    return (
                      <label key={resource.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowed}
                          onChange={e => !readOnly && toggleResource(action.id, resource.id, e.target.checked)}
                          disabled={readOnly}
                          className="h-4 w-4 rounded border-ops-bd accent-ops-blue"
                        />
                        <span className="text-sm text-ops-tx">{resource.label}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </Panel>
    </div>
  )
}

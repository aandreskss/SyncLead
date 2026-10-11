"use client"

import { Plus, Trash2 } from "lucide-react"
import { Panel, opsField } from "@/components/app/ops"
import type { AgentObjetivoConfig } from "@/domains/ai-agents/types"
import { cn } from "@/lib/utils"

interface Props {
  config: AgentObjetivoConfig
  onChange: (v: AgentObjetivoConfig) => void
  readOnly: boolean
}

export default function TabObjetivo({ config, onChange, readOnly }: Props) {
  function addStep() {
    onChange({ ...config, steps: [...config.steps, ""] })
  }

  function updateStep(i: number, val: string) {
    const next = [...config.steps]
    next[i] = val
    onChange({ ...config, steps: next })
  }

  function removeStep(i: number) {
    onChange({ ...config, steps: config.steps.filter((_, idx) => idx !== i) })
  }

  function addDataItem() {
    onChange({ ...config, requiredData: [...config.requiredData, ""] })
  }

  function updateDataItem(i: number, val: string) {
    const next = [...config.requiredData]
    next[i] = val
    onChange({ ...config, requiredData: next })
  }

  function removeDataItem(i: number) {
    onChange({ ...config, requiredData: config.requiredData.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="space-y-4">
      <Panel title="Meta del agente" description="¿Qué debe lograr el agente en cada conversación?">
        <div className="px-5 pb-5">
          <textarea
            value={config.goal}
            onChange={e => onChange({ ...config, goal: e.target.value })}
            readOnly={readOnly}
            placeholder="Ej: Calificar leads de campañas Meta, recopilar nombre, interés y ciudad, y registrar la información en el CRM."
            rows={4}
            className={cn(opsField, "resize-none")}
            aria-label="Meta del agente"
          />
        </div>
      </Panel>

      <Panel title="Pasos del proceso" description="Define el flujo de la conversación paso a paso.">
        <div className="space-y-2 px-5 pb-4">
          {config.steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ops-blue-bg text-[11px] font-semibold text-ops-blue">
                {i + 1}
              </span>
              <input
                value={step}
                onChange={e => updateStep(i, e.target.value)}
                readOnly={readOnly}
                placeholder={`Paso ${i + 1}`}
                className={cn(opsField, "flex-1")}
                aria-label={`Paso ${i + 1}`}
              />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="mt-2 rounded-full p-1 text-ops-tx3 hover:bg-red-50 hover:text-red-500"
                  aria-label={`Eliminar paso ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}

          {!readOnly && (
            <button
              type="button"
              onClick={addStep}
              className="flex items-center gap-1.5 rounded-full border border-dashed border-ops-bd px-3 py-1.5 text-sm text-ops-tx2 hover:border-ops-blue hover:text-ops-blue"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Agregar paso
            </button>
          )}
        </div>
      </Panel>

      <Panel title="Datos requeridos" description="Información que el agente debe recopilar del lead.">
        <div className="space-y-2 px-5 pb-4">
          {config.requiredData.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={item}
                onChange={e => updateDataItem(i, e.target.value)}
                readOnly={readOnly}
                placeholder="Ej: nombre completo"
                className={cn(opsField, "flex-1")}
                aria-label={`Dato requerido ${i + 1}`}
              />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeDataItem(i)}
                  className="rounded-full p-1 text-ops-tx3 hover:bg-red-50 hover:text-red-500"
                  aria-label={`Eliminar dato ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}

          {!readOnly && (
            <button
              type="button"
              onClick={addDataItem}
              className="flex items-center gap-1.5 rounded-full border border-dashed border-ops-bd px-3 py-1.5 text-sm text-ops-tx2 hover:border-ops-blue hover:text-ops-blue"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Agregar dato
            </button>
          )}
        </div>
      </Panel>

      <Panel title="Criterio de finalización" description="¿Cuándo se considera completado el objetivo?">
        <div className="px-5 pb-5">
          <textarea
            value={config.completionCriteria}
            onChange={e => onChange({ ...config, completionCriteria: e.target.value })}
            readOnly={readOnly}
            placeholder="Ej: El lead ha confirmado su nombre, interés y ciudad, y fue registrado en el CRM."
            rows={3}
            className={cn(opsField, "resize-none")}
            aria-label="Criterio de finalización"
          />
        </div>
      </Panel>
    </div>
  )
}

"use client"

import { Plus, Trash2 } from "lucide-react"
import { Panel, opsField } from "@/components/app/ops"
import type { AgentReglasConfig } from "@/domains/ai-agents/types"
import { cn } from "@/lib/utils"

interface Props {
  config: AgentReglasConfig
  onChange: (v: AgentReglasConfig) => void
  readOnly: boolean
}

export default function TabReglas({ config, onChange, readOnly }: Props) {
  function addProhibition() {
    onChange({ ...config, prohibitions: [...config.prohibitions, ""] })
  }

  function updateProhibition(i: number, val: string) {
    const next = [...config.prohibitions]
    next[i] = val
    onChange({ ...config, prohibitions: next })
  }

  function removeProhibition(i: number) {
    onChange({ ...config, prohibitions: config.prohibitions.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Prohibiciones"
        description="Comportamientos o respuestas que el agente nunca debe realizar."
        actions={
          !readOnly ? (
            <button
              type="button"
              onClick={addProhibition}
              className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Agregar
            </button>
          ) : undefined
        }
      >
        <div className="space-y-2 px-5 pb-4">
          {config.prohibitions.length === 0 && (
            <p className="text-sm text-ops-tx2">Sin prohibiciones definidas.</p>
          )}
          {config.prohibitions.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2.5 text-red-500 shrink-0" aria-hidden="true">✕</span>
              <input
                value={item}
                onChange={e => updateProhibition(i, e.target.value)}
                readOnly={readOnly}
                placeholder="Ej: No ofrecer precios sin autorización"
                className={cn(opsField, "flex-1")}
                aria-label={`Prohibición ${i + 1}`}
              />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeProhibition(i)}
                  className="mt-2 rounded-full p-1 text-ops-tx3 hover:bg-red-50 hover:text-red-500"
                  aria-label={`Eliminar prohibición ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button
              type="button"
              onClick={addProhibition}
              className="flex items-center gap-1.5 rounded-full border border-dashed border-red-200 px-3 py-1.5 text-sm text-red-500 hover:border-red-400"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Agregar prohibición
            </button>
          )}
        </div>
      </Panel>

      <Panel title="Regla de transferencia" description="Cuándo y cómo escalar a un agente humano.">
        <div className="px-5 pb-5">
          <textarea
            value={config.transferRule ?? ""}
            onChange={e => onChange({ ...config, transferRule: e.target.value })}
            readOnly={readOnly}
            placeholder="Ej: Transferir al equipo humano si el lead solicita hablar con una persona, si presenta una queja formal, o si lleva más de 5 mensajes sin resolver."
            rows={4}
            className={cn(opsField, "resize-none")}
            aria-label="Regla de transferencia"
          />
        </div>
      </Panel>

      <Panel title="Horario de atención" description="Define cuándo el agente responde automáticamente.">
        <div className="px-5 pb-5">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.schedule?.enabled ?? false}
              onChange={e => onChange({
                ...config,
                schedule: {
                  timezone: config.schedule?.timezone ?? "America/Caracas",
                  enabled: e.target.checked,
                  hours: config.schedule?.hours,
                },
              })}
              disabled={readOnly}
              className="h-4 w-4 rounded border-ops-bd accent-ops-blue"
              aria-label="Limitar horario de atención"
            />
            <span className="text-sm text-ops-tx">Limitar horario de atención automática</span>
          </label>

          {config.schedule?.enabled && (
            <div className="mt-3 rounded-xl border border-ops-line bg-ops-s2 p-3">
              <p className="text-xs text-ops-tx2">
                La configuración de horarios por día estará disponible en la próxima versión. Por ahora el agente responde 24/7.
              </p>
              <div className="mt-2">
                <label className="block text-xs font-medium text-ops-tx mb-1">Zona horaria</label>
                <select
                  value={config.schedule?.timezone ?? "America/Caracas"}
                  onChange={e => onChange({ ...config, schedule: { ...(config.schedule!), timezone: e.target.value } })}
                  disabled={readOnly}
                  className={cn(opsField, "max-w-xs")}
                  aria-label="Zona horaria"
                >
                  <option value="America/Caracas">América/Caracas (VET -4)</option>
                  <option value="America/Bogota">América/Bogotá (COT -5)</option>
                  <option value="America/Mexico_City">América/Ciudad de México (CST -6)</option>
                  <option value="America/Santiago">América/Santiago (CLT -3)</option>
                  <option value="America/Sao_Paulo">América/São Paulo (BRT -3)</option>
                  <option value="America/Buenos_Aires">América/Buenos Aires (ART -3)</option>
                  <option value="Europe/Madrid">Europa/Madrid (CET +1)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Límites de conversación" description="Controles de tiempo y volumen de mensajes.">
        <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-ops-tx mb-1">
              Tiempo de inactividad (minutos)
            </label>
            <input
              type="number"
              value={config.inactivityTimeoutMinutes}
              onChange={e => onChange({ ...config, inactivityTimeoutMinutes: Math.max(1, parseInt(e.target.value) || 60) })}
              readOnly={readOnly}
              min={1}
              max={10080}
              className={opsField}
              aria-label="Tiempo de inactividad en minutos"
            />
            <p className="mt-1 text-xs text-ops-tx3">El agente deja de responder si hay silencio por este tiempo.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ops-tx mb-1">
              Máximo de mensajes por conversación
            </label>
            <input
              type="number"
              value={config.maxMessagesPerConversation}
              onChange={e => onChange({ ...config, maxMessagesPerConversation: Math.max(1, parseInt(e.target.value) || 30) })}
              readOnly={readOnly}
              min={1}
              max={500}
              className={opsField}
              aria-label="Máximo de mensajes por conversación"
            />
            <p className="mt-1 text-xs text-ops-tx3">Al superar este límite la conversación se transfiere al equipo.</p>
          </div>
        </div>
      </Panel>
    </div>
  )
}

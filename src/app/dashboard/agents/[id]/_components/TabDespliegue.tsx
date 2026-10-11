"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Phone, AlertTriangle, PauseCircle, PlayCircle, Clock, Loader2 } from "lucide-react"
import { Panel } from "@/components/app/ops"
import type { AgentDespliegueConfig } from "@/domains/ai-agents/types"
import { toggleDeploymentPauseAction, upsertScheduleAction } from "@/domains/ai-agents/inbox-actions"
import { cn } from "@/lib/utils"

interface PhoneRow {
  id: string
  displayPhoneNumber: string
  verifiedName: string | null
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
  config: AgentDespliegueConfig
  phoneNumbers: PhoneRow[]
  campaigns: CampaignRow[]
  onChange: (v: AgentDespliegueConfig) => void
  readOnly: boolean
  deployment: DeploymentData | null
}

const WEEKDAYS = [
  { key: "mon", label: "Lun" },
  { key: "tue", label: "Mar" },
  { key: "wed", label: "Mié" },
  { key: "thu", label: "Jue" },
  { key: "fri", label: "Vie" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
] as const

const PHONE_STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  inactive: "Inactivo",
  pending: "Pendiente",
  deleted: "Eliminado",
}

export default function TabDespliegue({ config, phoneNumbers, campaigns, onChange, readOnly, deployment }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)

  // Schedule local state
  const [schedTimezone, setSchedTimezone] = useState(deployment?.scheduleTimezone ?? "UTC")
  const [schedEnabled, setSchedEnabled] = useState(deployment?.scheduleEnabled ?? false)
  const [schedWindows, setSchedWindows] = useState<Record<string, Array<{ start: string; end: string }>>>(
    deployment?.scheduleWindows ?? {}
  )

  function toggleCampaign(campaignId: string) {
    const ids = config.campaignIds
    const next = ids.includes(campaignId)
      ? ids.filter(id => id !== campaignId)
      : [...ids, campaignId]
    onChange({ ...config, campaignIds: next })
  }

  function handleTogglePause() {
    if (!deployment) return
    setActionError(null)
    startTransition(async () => {
      const res = await toggleDeploymentPauseAction(deployment.id)
      if (!res.success) { setActionError(res.error); return }
      router.refresh()
    })
  }

  function addWindow(dayKey: string) {
    setSchedWindows(prev => ({
      ...prev,
      [dayKey]: [...(prev[dayKey] ?? []), { start: "09:00", end: "17:00" }],
    }))
  }

  function removeWindow(dayKey: string, idx: number) {
    setSchedWindows(prev => ({
      ...prev,
      [dayKey]: (prev[dayKey] ?? []).filter((_, i) => i !== idx),
    }))
  }

  function updateWindow(dayKey: string, idx: number, field: "start" | "end", value: string) {
    setSchedWindows(prev => {
      const day = [...(prev[dayKey] ?? [])]
      day[idx] = { ...day[idx]!, [field]: value }
      return { ...prev, [dayKey]: day }
    })
  }

  function handleSaveSchedule() {
    if (!deployment) return
    setActionError(null)
    startTransition(async () => {
      const res = await upsertScheduleAction({
        deploymentId: deployment.id,
        timezone: schedTimezone,
        windows: schedWindows,
        enabled: schedEnabled,
      })
      if (!res.success) { setActionError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Separation notice */}
      <div className="flex items-start gap-3 rounded-xl border border-ops-amber bg-ops-amber-bg px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <p className="text-sm text-ops-tx">
          <strong>Publicar configuración y habilitar envíos reales son operaciones distintas.</strong>{" "}
          Guardar o publicar este agente no activa automáticamente ninguna conexión. La habilitación de envíos reales se gestiona desde{" "}
          <a href="/dashboard/settings/channels" className="underline hover:text-ops-blue">
            Configuración &rarr; Canales
          </a>
          .
        </p>
      </div>

      {/* Phone number */}
      <Panel title="Número de WhatsApp" description="Número al que se asocia este agente.">
        <div className="px-5 pb-5">
          {phoneNumbers.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-ops-bd p-4">
              <Phone className="h-5 w-5 shrink-0 text-ops-tx3" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-ops-tx">Sin números configurados</p>
                <p className="text-xs text-ops-tx2">
                  Conecta un número desde{" "}
                  <a href="/dashboard/settings/channels" className="text-ops-blue underline">
                    Configuración &rarr; Canales
                  </a>{" "}
                  para poder asignar este agente.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-ops-bd p-3.5 hover:border-ops-bd2 transition-colors">
                <input
                  type="radio"
                  name="phoneNumberId"
                  value=""
                  checked={!config.phoneNumberId}
                  onChange={() => !readOnly && onChange({ ...config, phoneNumberId: undefined })}
                  disabled={readOnly}
                  className="h-4 w-4 border-ops-bd accent-ops-blue"
                />
                <span className="text-sm text-ops-tx2">Sin asignar (agente en modo configuración)</span>
              </label>

              {phoneNumbers.map(phone => {
                const selected = config.phoneNumberId === phone.id
                return (
                  <label
                    key={phone.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors",
                      selected ? "border-ops-blue bg-ops-blue-bg" : "border-ops-bd hover:border-ops-bd2",
                      readOnly && "cursor-default"
                    )}
                  >
                    <input
                      type="radio"
                      name="phoneNumberId"
                      value={phone.id}
                      checked={selected}
                      onChange={() => !readOnly && onChange({ ...config, phoneNumberId: phone.id })}
                      disabled={readOnly}
                      className="h-4 w-4 border-ops-bd accent-ops-blue"
                      aria-label={`${phone.displayPhoneNumber}${phone.verifiedName ? ` — ${phone.verifiedName}` : ""}`}
                    />
                    <Phone className="h-4 w-4 shrink-0 text-ops-tx3" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ops-tx">{phone.displayPhoneNumber}</p>
                      {phone.verifiedName && (
                        <p className="text-xs text-ops-tx3">{phone.verifiedName}</p>
                      )}
                    </div>
                    <span className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      phone.status === "active"
                        ? "bg-ops-green-bg text-ops-green"
                        : "bg-ops-s2 text-ops-tx3"
                    )}>
                      {PHONE_STATUS_LABEL[phone.status] ?? phone.status}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      </Panel>

      {/* Default agent */}
      <Panel
        title="Agente predeterminado"
        description="Si está marcado, este agente responde a todos los mensajes del número que no coincidan con otra regla de campaña."
      >
        <div className="px-5 pb-5">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.isDefault}
              onChange={e => !readOnly && onChange({ ...config, isDefault: e.target.checked })}
              disabled={readOnly}
              className="h-4 w-4 rounded border-ops-bd accent-ops-blue"
              aria-label="Marcar como agente predeterminado"
            />
            <div>
              <span className="text-sm text-ops-tx">Agente predeterminado para el número seleccionado</span>
              <p className="text-xs text-ops-tx3 mt-0.5">
                Solo puede haber un agente predeterminado activo por número en un momento dado.
              </p>
            </div>
          </label>
        </div>
      </Panel>

      {/* Campaign rules */}
      <Panel
        title="Campañas vinculadas"
        description="El agente se activa automáticamente en conversaciones que provengan de leads de estas campañas."
      >
        <div className="px-5 pb-5">
          {campaigns.length === 0 ? (
            <p className="text-sm text-ops-tx2">
              No hay campañas disponibles. Crea campañas desde la sección{" "}
              <a href="/dashboard/campaigns" className="text-ops-blue underline">Campañas</a>.
            </p>
          ) : (
            <div className="space-y-2">
              {campaigns.map(campaign => {
                const selected = config.campaignIds.includes(campaign.id)
                return (
                  <label
                    key={campaign.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors",
                      selected ? "border-ops-blue bg-ops-blue-bg" : "border-ops-bd hover:border-ops-bd2",
                      readOnly && "cursor-default"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => !readOnly && toggleCampaign(campaign.id)}
                      disabled={readOnly}
                      className="h-4 w-4 rounded border-ops-bd accent-ops-blue"
                      aria-label={campaign.name}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ops-tx">{campaign.name}</p>
                      <p className="text-xs text-ops-tx3">{campaign.clientName}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          )}

          {config.campaignIds.length > 0 && campaigns.length > 0 && (
            <p className="mt-3 text-xs text-ops-tx3">
              {config.campaignIds.length} campaña{config.campaignIds.length !== 1 ? "s" : ""} seleccionada{config.campaignIds.length !== 1 ? "s" : ""}.
              {config.isDefault && " El agente también responde a conversaciones sin campaña vinculada (modo predeterminado)."}
            </p>
          )}
        </div>
      </Panel>

      {/* Error banner */}
      {actionError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      {/* Pause / activate deployment */}
      {deployment && (
        <Panel
          title="Estado del agente"
          description="Pausa el agente para bloquear nuevos envíos IA. Las conversaciones activas no se interrumpen."
        >
          <div className="flex items-center justify-between px-5 pb-5">
            <div className="flex items-center gap-2">
              {deployment.paused
                ? <PauseCircle className="h-5 w-5 text-amber-600" aria-hidden="true" />
                : <PlayCircle className="h-5 w-5 text-ops-green" aria-hidden="true" />
              }
              <span className="text-sm font-medium text-ops-tx">
                {deployment.paused ? "Agente pausado" : "Agente activo"}
              </span>
            </div>
            <button
              type="button"
              onClick={handleTogglePause}
              disabled={isPending || readOnly}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-colors disabled:opacity-50",
                deployment.paused
                  ? "bg-ops-green text-white hover:bg-ops-green-d"
                  : "bg-amber-100 text-amber-700 hover:bg-amber-200"
              )}
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {deployment.paused ? "Activar" : "Pausar"}
            </button>
          </div>
        </Panel>
      )}

      {/* Schedule */}
      {deployment && (
        <Panel
          title="Horario de atención"
          description="Define en qué franjas horarias el agente puede iniciar nuevas conversaciones. Usa zona IANA."
        >
          <div className="space-y-4 px-5 pb-5">
            {/* Enabled toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={schedEnabled}
                onChange={e => !readOnly && setSchedEnabled(e.target.checked)}
                disabled={readOnly}
                className="h-4 w-4 rounded border-ops-bd accent-ops-blue"
                aria-label="Activar horario restringido"
              />
              <div>
                <span className="text-sm text-ops-tx">Activar horario restringido</span>
                <p className="text-xs text-ops-tx3 mt-0.5">
                  Si está desactivado, el agente opera 24/7.
                </p>
              </div>
            </label>

            {schedEnabled && (
              <>
                {/* Timezone */}
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 shrink-0 text-ops-tx3" aria-hidden="true" />
                  <label className="text-sm text-ops-tx2 shrink-0">Zona horaria</label>
                  <input
                    type="text"
                    value={schedTimezone}
                    onChange={e => !readOnly && setSchedTimezone(e.target.value)}
                    disabled={readOnly}
                    placeholder="America/Caracas"
                    className="flex-1 rounded-lg border border-ops-bd bg-ops-s2 px-3 py-1.5 text-sm text-ops-tx focus:border-ops-blue focus:outline-none disabled:opacity-50"
                    aria-label="Zona horaria IANA"
                  />
                </div>

                {/* Daily windows */}
                <div className="space-y-2">
                  {WEEKDAYS.map(({ key, label }) => {
                    const dayWins = schedWindows[key] ?? []
                    return (
                      <div key={key} className="rounded-xl border border-ops-bd p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-ops-tx">{label}</span>
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => addWindow(key)}
                              className="text-xs text-ops-blue hover:underline"
                              aria-label={`Añadir ventana para ${label}`}
                            >
                              + Añadir
                            </button>
                          )}
                        </div>
                        {dayWins.length === 0 ? (
                          <p className="mt-1 text-xs text-ops-tx3">Sin atención este día</p>
                        ) : (
                          <div className="mt-2 space-y-1.5">
                            {dayWins.map((w, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <input
                                  type="time"
                                  value={w.start}
                                  onChange={e => !readOnly && updateWindow(key, idx, "start", e.target.value)}
                                  disabled={readOnly}
                                  className="rounded-lg border border-ops-bd bg-ops-s2 px-2 py-1 text-xs text-ops-tx focus:outline-none disabled:opacity-50"
                                  aria-label="Hora de inicio"
                                />
                                <span className="text-xs text-ops-tx3">–</span>
                                <input
                                  type="time"
                                  value={w.end}
                                  onChange={e => !readOnly && updateWindow(key, idx, "end", e.target.value)}
                                  disabled={readOnly}
                                  className="rounded-lg border border-ops-bd bg-ops-s2 px-2 py-1 text-xs text-ops-tx focus:outline-none disabled:opacity-50"
                                  aria-label="Hora de fin"
                                />
                                {!readOnly && (
                                  <button
                                    type="button"
                                    onClick={() => removeWindow(key, idx)}
                                    className="text-xs text-ops-red hover:underline"
                                    aria-label={`Eliminar ventana ${idx + 1} de ${label}`}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {!readOnly && (
              <button
                type="button"
                onClick={handleSaveSchedule}
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-lg bg-ops-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Guardar horario
              </button>
            )}
          </div>
        </Panel>
      )}

      {/* Simulator placeholder */}
      <Panel title="Simulador" description="Prueba el comportamiento del agente antes de publicar.">
        <div className="px-5 pb-5">
          <div className="rounded-xl border border-dashed border-ops-bd p-6 text-center">
            <p className="text-sm font-medium text-ops-tx2">Simulador pendiente</p>
            <p className="mt-1 text-xs text-ops-tx3">
              El simulador de conversación estará disponible en una próxima fase.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  )
}

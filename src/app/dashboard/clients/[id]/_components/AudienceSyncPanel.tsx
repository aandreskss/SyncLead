"use client"

import { useState, useTransition } from "react"
import { Users2, RefreshCw, Loader2, ExternalLink, CheckCircle2, AlertCircle, Clock } from "lucide-react"
import { getAudiencesAction, triggerAudienceSyncAction, type AudiencePublic } from "@/domains/meta-audiences/actions"

const AUDIENCE_LABELS: Record<string, { label: string; description: string; color: string }> = {
  buyers: {
    label: "Compradores",
    description: "Leads que completaron una compra. Usa para excluir de prospección o crear Lookalike.",
    color: "text-emerald-400 bg-emerald-900/20 border-emerald-800",
  },
  cart_abandoners: {
    label: "Carrito abandonado",
    description: "Iniciaron checkout pero no compraron. Retargeting con oferta.",
    color: "text-amber-400 bg-amber-900/20 border-amber-800",
  },
  exclusion: {
    label: "Descartados",
    description: "Leads fríos no calificados. Excluir para no desperdiciar presupuesto.",
    color: "text-red-400 bg-red-900/20 border-red-800",
  },
}

function relativeTime(date: Date | null): string {
  if (!date) return "Nunca"
  const diffMs = Date.now() - new Date(date).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "Ahora mismo"
  if (diffMin < 60) return `Hace ${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `Hace ${diffH}h`
  return `Hace ${Math.floor(diffH / 24)}d`
}

export function AudienceSyncPanel({ clientId, hasAdAccount }: { clientId: string; hasAdAccount: boolean }) {
  const [audiences, setAudiences] = useState<AudiencePublic[] | null>(null)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, startLoad] = useTransition()
  const [isSyncing, startSync] = useTransition()

  function load() {
    setError(null)
    startLoad(async () => {
      const r = await getAudiencesAction(clientId)
      if (r.error) setError("No se pudieron cargar las audiencias")
      else setAudiences(r.data ?? [])
    })
  }

  function sync() {
    setSyncMsg(null)
    setError(null)
    startSync(async () => {
      const r = await triggerAudienceSyncAction(clientId)
      if (r.error) {
        setError("Error al sincronizar. Verifica que la conexión Meta tiene Ad Account ID configurado.")
      } else {
        setSyncMsg(`Sincronización completada: ${r.synced} audiencias actualizadas${r.errors ? `, ${r.errors} errores` : ""}`)
        load()
      }
    })
  }

  if (!hasAdAccount) {
    return (
      <div className="rounded-lg border border-ops-line bg-ops-s1 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users2 className="h-4 w-4 text-ops-tx2" />
          <h3 className="text-sm font-semibold text-ops-tx">Audiencias Personalizadas de Meta</h3>
        </div>
        <p className="text-sm text-ops-tx3">
          Para activar la sincronización de audiencias, configura el <strong className="text-ops-tx2">Ad Account ID</strong> en la conexión Meta de este cliente.
          El Ad Account ID tiene formato <code className="text-ops-tx2">act_XXXXXXXXX</code> y lo encuentras en el Administrador de Anuncios.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-ops-line bg-ops-s1 overflow-hidden">
      <div className="flex items-center justify-between border-b border-ops-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Users2 className="h-4 w-4 text-ops-blue" />
          <h3 className="text-sm font-semibold text-ops-tx">Audiencias Personalizadas de Meta</h3>
        </div>
        <div className="flex items-center gap-2">
          {!audiences && (
            <button
              onClick={load}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded border border-ops-bd bg-ops-s2 px-2.5 py-1.5 text-xs text-ops-tx2 hover:bg-ops-sel transition-colors disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users2 className="h-3.5 w-3.5" />}
              Ver audiencias
            </button>
          )}
          <button
            onClick={sync}
            disabled={isSyncing || isLoading}
            className="flex items-center gap-1.5 rounded bg-ops-blue px-2.5 py-1.5 text-xs font-medium text-white hover:bg-ops-blue/90 transition-colors disabled:opacity-50"
          >
            {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sincronizar ahora
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-xs text-ops-tx3">
          SyncLead sincroniza automáticamente 3 audiencias en tu Meta Ads Manager cada noche. Úsalas para retargeting, exclusión y Lookalike.
        </p>

        {error && (
          <div className="flex items-center gap-2 rounded border border-red-900 bg-red-900/20 px-3 py-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {syncMsg && (
          <div className="flex items-center gap-2 rounded border border-emerald-900 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            {syncMsg}
          </div>
        )}

        {/* Audience cards */}
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(AUDIENCE_LABELS).map(([type, meta]) => {
            const audience = audiences?.find((a) => a.audienceType === type)
            return (
              <div key={type} className="rounded border border-ops-bd bg-ops-s2 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${meta.color}`}>
                    {meta.label}
                  </span>
                  {audience?.metaAudienceId && (
                    <a
                      href={`https://business.facebook.com/audiences`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ops-tx3 hover:text-ops-tx2"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                <p className="text-[10px] text-ops-tx3 leading-relaxed">{meta.description}</p>

                <div className="flex items-center justify-between pt-1 border-t border-ops-line">
                  <div>
                    <p className="text-lg font-bold text-ops-tx">
                      {audience ? audience.memberCount.toLocaleString() : "—"}
                    </p>
                    <p className="text-[10px] text-ops-tx3">personas</p>
                  </div>
                  <div className="text-right">
                    {audience?.lastError ? (
                      <p className="text-[10px] text-red-400 flex items-center gap-0.5">
                        <AlertCircle className="h-2.5 w-2.5" />Error
                      </p>
                    ) : audience?.lastSyncedAt ? (
                      <p className="text-[10px] text-ops-tx3 flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {relativeTime(audience.lastSyncedAt)}
                      </p>
                    ) : (
                      <p className="text-[10px] text-ops-tx3">Sin sincronizar</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[10px] text-ops-tx3">
          Sincronización automática cada noche a las 2 AM. Los emails y teléfonos se hashean con SHA-256 antes de enviarse a Meta — nunca se envían en texto plano.
        </p>
      </div>
    </div>
  )
}

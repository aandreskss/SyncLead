"use client"

import { useState, useTransition } from "react"
import { BarChart3, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Clock, KeyRound, Trash2 } from "lucide-react"
import {
  saveInsightsConnectionAction,
  triggerSyncAction,
  getInsightsSummaryAction,
  updateInsightsTokenAction,
  disconnectInsightsConnectionAction,
} from "@/domains/meta-insights/actions"
import type { InsightsConnectionPublic, InsightsSummary } from "@/domains/meta-insights/types"

interface Props {
  clientId: string
  initialConnections: InsightsConnectionPublic[]
}

export function MetaInsightsPanel({ clientId, initialConnections }: Props) {
  const [connections, setConnections] = useState(initialConnections)
  const [adAccountId, setAdAccountId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showForceOption, setShowForceOption] = useState(false)
  // Per-connection update token form
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [updateToken, setUpdateToken] = useState("")
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [updateForce, setUpdateForce] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null)
  const [summary, setSummary] = useState<InsightsSummary | null>(null)
  const [isPending, start] = useTransition()

  const activeConn = connections.find((c) => c.status === "active")

  function handleConnect(skipVerification = false) {
    setFormError(null)
    setShowForceOption(false)
    start(async () => {
      const result = await saveInsightsConnectionAction({ clientId, adAccountId, accessToken, skipVerification })
      if (result.success && result.connection) {
        setConnections((prev) => [result.connection!, ...prev])
        setShowForm(false)
        setAdAccountId("")
        setAccessToken("")
      } else {
        setFormError(result.error ?? "Error al conectar")
        if (result.verificationFailed) setShowForceOption(true)
      }
    })
  }

  function handleUpdateToken(connectionId: string, skip = false) {
    setUpdateError(null)
    setUpdateForce(false)
    start(async () => {
      const res = await updateInsightsTokenAction(connectionId, clientId, updateToken, skip)
      if (res.success) {
        setConnections((prev) => prev.map((c) =>
          c.id === connectionId ? { ...c, status: "active", lastError: null, lastVerifiedAt: new Date() } : c
        ))
        setUpdatingId(null)
        setUpdateToken("")
      } else {
        setUpdateError(res.error ?? "Error al actualizar")
        if (res.error?.includes("Guardar de todas formas")) setUpdateForce(true)
      }
    })
  }

  function handleDisconnect(connectionId: string) {
    start(async () => {
      const res = await disconnectInsightsConnectionAction(connectionId, clientId)
      if (res.success) {
        setConnections((prev) => prev.filter((c) => c.id !== connectionId))
      }
      setConfirmDisconnect(null)
    })
  }

  function handleSync(connectionId: string, act: string) {
    start(async () => {
      const result = await triggerSyncAction({ connectionId, clientId, syncType: "incremental" })
      if (result.success) {
        const to = new Date().toISOString().slice(0, 10)
        const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const s = await getInsightsSummaryAction(clientId, act, from, to)
        setSummary(s)
      }
    })
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-ops-tx2" />
          <h2 className="text-sm font-semibold text-ops-tx">Meta Ads Insights</h2>
          <span className="text-xs px-1.5 py-0.5 rounded-md bg-amber-500/15 text-ops-amber font-medium border border-amber-500/20">
            Beta interna
          </span>
        </div>

        {!activeConn && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-xs text-ops-tx2 hover:text-ops-tx border border-ops-bd px-2.5 py-1 rounded-lg transition-colors"
          >
            Conectar cuenta
          </button>
        )}
      </div>

      <p className="text-xs text-ops-tx3">
        Sincroniza datos de gasto, alcance e impresiones desde Meta Ads. Solo para cuentas
        autorizadas en la allowlist de la beta interna.
      </p>

      {/* New connection form */}
      {showForm && (
        <div className="space-y-3 rounded-lg border border-ops-bd bg-ops-s2/40 p-4">
          <p className="text-xs text-ops-amber flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Acceso restringido a cuentas autorizadas en la beta interna.
          </p>
          <div>
            <label className="text-xs text-ops-tx2">Ad Account ID</label>
            <input
              type="text"
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              placeholder="act_12345678"
              className="mt-1 w-full rounded-lg border border-ops-bd bg-ops-s1 px-3 py-2 text-sm text-ops-tx placeholder:text-ops-tx3 focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-ops-tx2">System User Access Token</label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Token con permiso ads_read"
              className="mt-1 w-full rounded-lg border border-ops-bd bg-ops-s1 px-3 py-2 text-sm text-ops-tx placeholder:text-ops-tx3 focus:border-zinc-500 focus:outline-none"
            />
          </div>
          {formError && <p className="text-xs text-ops-coral">{formError}</p>}
          {showForceOption && (
            <p className="text-xs text-ops-amber">
              Si ya asignaste el System User y regeneraste el token, puedes guardar igual y probar la sincronización.
            </p>
          )}
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleConnect(false)}
              disabled={isPending || !adAccountId || !accessToken}
              className="flex items-center gap-1.5 text-xs bg-ops-sel hover:bg-zinc-600 disabled:opacity-50 text-ops-tx px-3 py-1.5 rounded-lg transition-colors"
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Verificar y conectar
            </button>
            {showForceOption && (
              <button
                type="button"
                onClick={() => handleConnect(true)}
                disabled={isPending}
                className="flex items-center gap-1.5 text-xs border border-ops-amber/50 text-ops-amber hover:bg-ops-amber/10 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Guardar de todas formas
              </button>
            )}
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(null); setShowForceOption(false) }}
              className="text-xs text-ops-tx3 hover:text-ops-tx2 px-3 py-1.5 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Existing connections */}
      {connections.length > 0 && (
        <div className="space-y-2">
          {connections.map((conn) => (
            <div key={conn.id} className="rounded-lg border border-ops-bd/60 bg-ops-s2/30 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  {conn.status === "active"
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-ops-green shrink-0" />
                    : <AlertTriangle className="h-3.5 w-3.5 text-ops-amber shrink-0" />}
                  <div>
                    <p className="text-sm text-ops-tx font-mono">{conn.adAccountId ?? "—"}</p>
                    {conn.lastVerifiedAt && (
                      <p className="text-xs text-ops-tx3 flex items-center gap-1 mt-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        Verificado {new Date(conn.lastVerifiedAt).toLocaleDateString()}
                      </p>
                    )}
                    {conn.lastError && <p className="text-xs text-ops-coral mt-0.5">{conn.lastError}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {conn.status === "active" && conn.adAccountId && (
                    <button
                      type="button"
                      onClick={() => handleSync(conn.id, conn.adAccountId!)}
                      disabled={isPending}
                      className="flex items-center gap-1 text-xs text-ops-tx2 hover:text-ops-tx border border-ops-bd px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Sync
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setUpdatingId(updatingId === conn.id ? null : conn.id); setUpdateToken(""); setUpdateError(null); setUpdateForce(false) }}
                    className="flex items-center gap-1 text-xs text-ops-tx2 hover:text-ops-tx border border-ops-bd px-2 py-1 rounded-lg transition-colors"
                    title="Actualizar token"
                  >
                    <KeyRound className="h-3 w-3" />
                    Token
                  </button>
                  {confirmDisconnect === conn.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-ops-coral">¿Confirmar?</span>
                      <button type="button" onClick={() => handleDisconnect(conn.id)} disabled={isPending} className="text-[10px] text-ops-coral hover:text-red-400 font-medium">Sí</button>
                      <button type="button" onClick={() => setConfirmDisconnect(null)} className="text-[10px] text-ops-tx3">No</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDisconnect(conn.id)}
                      className="text-ops-tx3 hover:text-ops-coral transition-colors"
                      title="Desconectar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Update token inline form */}
              {updatingId === conn.id && (
                <div className="border-t border-ops-bd/60 bg-ops-s1/50 px-4 py-3 space-y-2">
                  <label className="text-xs text-ops-tx2">Nuevo token de acceso</label>
                  <input
                    type="password"
                    value={updateToken}
                    onChange={(e) => setUpdateToken(e.target.value)}
                    placeholder="Pega el nuevo System User Access Token"
                    className="w-full rounded-lg border border-ops-bd bg-ops-s1 px-3 py-2 text-sm text-ops-tx placeholder:text-ops-tx3 focus:border-zinc-500 focus:outline-none"
                  />
                  {updateError && <p className="text-xs text-ops-coral">{updateError}</p>}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleUpdateToken(conn.id, false)}
                      disabled={isPending || !updateToken}
                      className="flex items-center gap-1.5 text-xs bg-ops-sel hover:bg-zinc-600 disabled:opacity-50 text-ops-tx px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Guardar token
                    </button>
                    {updateForce && (
                      <button
                        type="button"
                        onClick={() => handleUpdateToken(conn.id, true)}
                        disabled={isPending}
                        className="flex items-center gap-1.5 text-xs border border-ops-amber/50 text-ops-amber hover:bg-ops-amber/10 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Guardar de todas formas
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setUpdatingId(null); setUpdateError(null); setUpdateForce(false) }}
                      className="text-xs text-ops-tx3 hover:text-ops-tx2 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* KPI summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Gasto", value: summary.currency ? `${summary.currency} ${summary.totalSpend.toFixed(2)}` : `$${summary.totalSpend.toFixed(2)}` },
            { label: "Impresiones", value: summary.totalImpressions.toLocaleString() },
            { label: "Clics", value: summary.totalClicks.toLocaleString() },
            { label: "CPL", value: summary.cpl != null ? `${summary.currency ?? "$"}${summary.cpl.toFixed(2)}` : "—" },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-ops-bd/60 bg-ops-s2/30 p-3">
              <p className="text-xs text-ops-tx3">{kpi.label}</p>
              <p className="text-sm font-semibold text-ops-tx mt-0.5">{kpi.value}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

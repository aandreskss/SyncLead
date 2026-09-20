"use client"

import { useState, useTransition } from "react"
import { BarChart3, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Clock } from "lucide-react"
import {
  saveInsightsConnectionAction,
  triggerSyncAction,
  getInsightsSummaryAction,
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
  const [summary, setSummary] = useState<InsightsSummary | null>(null)
  const [isPending, start] = useTransition()

  const activeConn = connections.find((c) => c.status === "active")

  function handleConnect() {
    setFormError(null)
    start(async () => {
      const result = await saveInsightsConnectionAction({ clientId, adAccountId, accessToken })
      if (result.success && result.connection) {
        setConnections((prev) => [result.connection!, ...prev])
        setShowForm(false)
        setAdAccountId("")
        setAccessToken("")
      } else {
        setFormError(result.error ?? "Error al conectar")
      }
    })
  }

  function handleSync(connectionId: string, act: string) {
    start(async () => {
      const result = await triggerSyncAction({ connectionId, clientId, syncType: "incremental" })
      if (result.success) {
        // Refresh summary after sync
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
          <BarChart3 className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-200">Meta Ads Insights</h2>
          <span className="text-xs px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 font-medium border border-amber-500/20">
            Beta interna
          </span>
        </div>

        {!activeConn && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 px-2.5 py-1 rounded-lg transition-colors"
          >
            Conectar cuenta
          </button>
        )}
      </div>

      <p className="text-xs text-zinc-500">
        Sincroniza datos de gasto, alcance e impresiones desde Meta Ads. Solo para cuentas
        autorizadas en la allowlist de la beta interna.
      </p>

      {/* Connection form */}
      {showForm && (
        <div className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-800/40 p-4">
          <p className="text-xs text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Acceso restringido a cuentas autorizadas en la beta interna.
          </p>
          <div>
            <label className="text-xs text-zinc-400">Ad Account ID</label>
            <input
              type="text"
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              placeholder="act_12345678"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400">System User Access Token</label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Token con permiso ads_read"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
            />
          </div>
          {formError && <p className="text-xs text-red-400">{formError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConnect}
              disabled={isPending || !adAccountId || !accessToken}
              className="flex items-center gap-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Verificar y conectar
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError(null) }}
              className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Active connections */}
      {connections.length > 0 && (
        <div className="space-y-2">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="flex items-center justify-between rounded-xl border border-zinc-700/60 bg-zinc-800/30 px-4 py-3"
            >
              <div className="flex items-center gap-2.5">
                {conn.status === "active" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                )}
                <div>
                  <p className="text-sm text-zinc-200 font-mono">{conn.adAccountId ?? "—"}</p>
                  {conn.lastVerifiedAt && (
                    <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      Verificado {new Date(conn.lastVerifiedAt).toLocaleDateString()}
                    </p>
                  )}
                  {conn.lastError && (
                    <p className="text-xs text-red-400 mt-0.5">{conn.lastError}</p>
                  )}
                </div>
              </div>

              {conn.status === "active" && conn.adAccountId && (
                <button
                  type="button"
                  onClick={() => handleSync(conn.id, conn.adAccountId!)}
                  disabled={isPending}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Sincronizar
                </button>
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
            <div key={kpi.label} className="rounded-xl border border-zinc-700/60 bg-zinc-800/30 p-3">
              <p className="text-xs text-zinc-500">{kpi.label}</p>
              <p className="text-sm font-semibold text-zinc-200 mt-0.5">{kpi.value}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

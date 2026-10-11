"use client"

import { useState } from "react"
import { Panel, StatusChip, opsBtnPrimary, opsBtnSecondary } from "@/components/app/ops"
import { AlertTriangle, CheckCircle2, Clock, Link2, Link2Off, Loader2 } from "lucide-react"
import type { WaConnectionStatus } from "@/domains/meta-wa-connect/types"

interface WabaRow {
  id: string
  wabaId: string
  displayName: string
  connectionMode: string
  connectionStatus: string
  connectedAt: Date | null
  tokenExpiresAt: Date | null
  oauthScopes: string[]
  lastError: string | null
}

const STATUS_TONE: Record<WaConnectionStatus | string, "green" | "amber" | "neutral" | "coral"> = {
  active: "green",
  pending_review: "amber",
  partial: "amber",
  reconnecting: "amber",
  error: "coral",
  disconnected: "neutral",
}

const STATUS_LABEL: Record<WaConnectionStatus | string, string> = {
  active: "Activo",
  pending_review: "Revisión Meta pendiente",
  partial: "Permisos parciales",
  reconnecting: "Reconectando…",
  error: "Error de token",
  disconnected: "Desconectado",
}

interface Props {
  wabas: WabaRow[]
  appConfigured: boolean
}

export function WaConnectPanel({ wabas, appConfigured }: Props) {
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDisconnect(wabaId: string) {
    setDisconnecting(wabaId)
    setError(null)
    try {
      const res = await fetch("/api/wa-connect/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wabaId }),
      })
      if (!res.ok) throw new Error("Disconnect failed")
      window.location.reload()
    } catch {
      setError("No se pudo desconectar. Intenta de nuevo.")
      setDisconnecting(null)
    }
  }

  const canConnect = appConfigured

  return (
    <Panel
      title="Conectar WhatsApp Business"
      description="Vincula la cuenta WhatsApp Business de tu empresa mediante el flujo oficial de Meta."
    >
      {!appConfigured && (
        <div className="mx-5 mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-800">
              <strong>App Meta no configurada.</strong> El administrador de la plataforma debe configurar{" "}
              <code>META_WA_APP_ID</code> antes de que las organizaciones puedan conectar sus activos.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mx-5 mb-4 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Connected accounts */}
      {wabas.length > 0 && (
        <div className="divide-y divide-ops-line border-t border-ops-line">
          {wabas.map(waba => (
            <div key={waba.id} className="flex items-start justify-between px-5 py-4 gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-ops-tx">{waba.displayName}</p>
                  <StatusChip tone={STATUS_TONE[waba.connectionStatus] ?? "neutral"}>
                    {STATUS_LABEL[waba.connectionStatus] ?? waba.connectionStatus}
                  </StatusChip>
                  {waba.connectionMode === "embedded_signup" && (
                    <StatusChip tone="neutral">OAuth</StatusChip>
                  )}
                </div>
                <p className="text-xs text-ops-tx3 mt-1">WABA ID: {waba.wabaId}</p>

                {waba.connectionStatus === "pending_review" && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <p className="text-xs text-amber-800">
                      La revisión de la app de Meta está pendiente. La conexión funcionará para usuarios de prueba.
                      Una vez aprobada, todos los clientes podrán usarla.
                    </p>
                  </div>
                )}

                {waba.connectionStatus === "error" && waba.lastError && (
                  <p className="mt-1 text-xs text-ops-coral">{waba.lastError}</p>
                )}

                {waba.tokenExpiresAt && (
                  <p className="mt-1 text-xs text-ops-tx3">
                    Token expira: {new Date(waba.tokenExpiresAt).toLocaleDateString()}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {waba.connectionStatus !== "disconnected" && (
                  <a
                    href={`/api/wa-connect/start?return=${encodeURIComponent("/dashboard/settings/channels")}`}
                    className={opsBtnSecondary + " text-xs py-1.5 px-3 flex items-center gap-1.5"}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Reconectar
                  </a>
                )}
                <button
                  onClick={() => handleDisconnect(waba.wabaId)}
                  disabled={disconnecting === waba.wabaId}
                  className="flex items-center gap-1.5 rounded-full border border-ops-bd bg-white px-3 py-1.5 text-xs font-medium text-ops-coral hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {disconnecting === waba.wabaId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Link2Off className="h-3.5 w-3.5" />
                  )}
                  Desconectar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connect button */}
      <div className="px-5 py-4 border-t border-ops-line">
        {canConnect ? (
          <a
            href="/api/wa-connect/start"
            className={opsBtnPrimary + " inline-flex items-center gap-2"}
          >
            <CheckCircle2 className="h-4 w-4" />
            Conectar con Meta
          </a>
        ) : (
          <button disabled className={opsBtnPrimary + " opacity-50 cursor-not-allowed inline-flex items-center gap-2"}>
            <CheckCircle2 className="h-4 w-4" />
            Conectar con Meta
          </button>
        )}
        <p className="mt-2 text-xs text-ops-tx3">
          Serás redirigido a Meta para autorizar el acceso a tu cuenta WhatsApp Business.
          El proceso usa el flujo oficial de Embedded Signup de Meta.
        </p>
        {wabas.some(w => w.connectionMode === "manual") && (
          <p className="mt-1 text-xs text-amber-700">
            Tienes conexiones en modo manual (piloto interno). Reconecta via OAuth para mayor seguridad.
          </p>
        )}
      </div>
    </Panel>
  )
}

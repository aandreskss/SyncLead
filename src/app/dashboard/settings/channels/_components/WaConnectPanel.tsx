"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Panel, StatusChip, opsBtnPrimary, opsBtnSecondary } from "@/components/app/ops"
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Link2, Link2Off, Loader2 } from "lucide-react"
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
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showWabaInput, setShowWabaInput] = useState(false)
  const [wabaIdInput, setWabaIdInput] = useState("")
  const router = useRouter()
  const popupRef = useRef<Window | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll until the popup closes, then refresh
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  function openOAuthPopup(url: string) {
    const width = 600
    const height = 700
    const left = Math.round(window.screenX + (window.outerWidth - width) / 2)
    const top = Math.round(window.screenY + (window.outerHeight - height) / 2)
    const popup = window.open(
      url,
      "wa_oauth",
      `width=${width},height=${height},left=${left},top=${top},toolbar=0,menubar=0,scrollbars=1`
    )
    if (!popup) {
      setError("El navegador bloqueó la ventana emergente. Permite ventanas emergentes para este sitio e intenta de nuevo.")
      return
    }
    popupRef.current = popup
    setConnecting(true)
    setError(null)

    pollRef.current = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollRef.current!)
        pollRef.current = null
        setConnecting(false)
        router.refresh()
      }
    }, 500)
  }

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
                  <button
                    onClick={() => openOAuthPopup(`/api/wa-connect/start?return=${encodeURIComponent("/dashboard/settings/channels")}`)}
                    disabled={connecting}
                    className={opsBtnSecondary + " text-xs py-1.5 px-3 flex items-center gap-1.5"}
                  >
                    {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    Reconectar
                  </button>
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
          <button
            onClick={() => {
              const wabaId = wabaIdInput.trim() || undefined
              const url = wabaId
                ? `/api/wa-connect/start?waba_id=${encodeURIComponent(wabaId)}`
                : "/api/wa-connect/start"
              openOAuthPopup(url)
            }}
            disabled={connecting}
            className={opsBtnPrimary + " inline-flex items-center gap-2"}
          >
            {connecting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <CheckCircle2 className="h-4 w-4" />
            }
            {connecting ? "Conectando…" : "Conectar con Meta"}
          </button>
        ) : (
          <button disabled className={opsBtnPrimary + " opacity-50 cursor-not-allowed inline-flex items-center gap-2"}>
            <CheckCircle2 className="h-4 w-4" />
            Conectar con Meta
          </button>
        )}
        <p className="mt-2 text-xs text-ops-tx3">
          Serás redirigido a Meta para autorizar el acceso a tu cuenta WhatsApp Business.
        </p>

        {/* Manual WABA ID fallback */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowWabaInput(v => !v)}
            className="flex items-center gap-1 text-xs text-ops-tx3 hover:text-ops-tx transition-colors"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showWabaInput ? "rotate-180" : ""}`} />
            ¿Problemas para conectar? Ingresar WABA ID manualmente
          </button>
          {showWabaInput && (
            <div className="mt-2 space-y-1.5">
              <p className="text-xs text-ops-tx3">
                Encuentra tu WABA ID en{" "}
                <strong>business.facebook.com → Configuración del negocio → Cuentas → Cuentas de WhatsApp Business</strong>.
              </p>
              <input
                type="text"
                value={wabaIdInput}
                onChange={e => setWabaIdInput(e.target.value)}
                placeholder="Ej: 123456789012345"
                className="w-full rounded-lg border border-ops-bd bg-white px-3 py-1.5 text-sm text-ops-tx placeholder:text-ops-tx3 focus:outline-none focus:ring-2 focus:ring-ops-accent"
              />
            </div>
          )}
        </div>

        {wabas.some(w => w.connectionMode === "manual") && (
          <p className="mt-2 text-xs text-amber-700">
            Tienes conexiones en modo manual (piloto interno). Reconecta via OAuth para mayor seguridad.
          </p>
        )}
      </div>
    </Panel>
  )
}

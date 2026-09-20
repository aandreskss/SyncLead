"use client"

import { useState, useTransition } from "react"
import { MessageCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react"
import { saveWaClientConfigAction } from "@/domains/whatsapp/actions"
import type { WaClientConfigPublic } from "@/domains/whatsapp/types"

interface Props {
  clientId: string
  initial: WaClientConfigPublic | null
}

export function WhatsAppConfigPanel({ clientId, initial }: Props) {
  const [config, setConfig] = useState<WaClientConfigPublic>(
    initial ?? { clientId, confirmationMode: "manual", providerName: null, hasProvider: false }
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, start] = useTransition()

  function handleModeChange(mode: "manual" | "provider") {
    setConfig((c) => ({ ...c, confirmationMode: mode }))
    setSaved(false)
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    start(async () => {
      const result = await saveWaClientConfigAction({
        clientId,
        confirmationMode: config.confirmationMode,
        providerName: config.providerName,
      })
      if (result && "error" in result) {
        setError(result.error ?? null)
      } else {
        setSaved(true)
      }
    })
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-200">Confirmación de WhatsApp</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Manual */}
        <button
          type="button"
          onClick={() => handleModeChange("manual")}
          className={`text-left rounded-xl border p-4 transition-colors ${
            config.confirmationMode === "manual"
              ? "border-emerald-500/50 bg-emerald-500/10"
              : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
          }`}
        >
          <p className={`text-sm font-medium ${config.confirmationMode === "manual" ? "text-emerald-300" : "text-zinc-200"}`}>
            Manual
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            El vendedor confirma explícitamente cuando el mensaje fue enviado. No requiere integración externa.
          </p>
          {config.confirmationMode === "manual" && (
            <p className="text-xs text-emerald-400 mt-2 font-medium">✓ Seleccionado</p>
          )}
        </button>

        {/* Provider */}
        <button
          type="button"
          onClick={() => handleModeChange("provider")}
          className={`text-left rounded-xl border p-4 transition-colors ${
            config.confirmationMode === "provider"
              ? "border-blue-500/50 bg-blue-500/10"
              : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
          }`}
        >
          <p className={`text-sm font-medium ${config.confirmationMode === "provider" ? "text-blue-300" : "text-zinc-200"}`}>
            Automática mediante proveedor
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            El estado se actualiza automáticamente a través de webhooks verificables del proveedor.
          </p>
          {config.confirmationMode === "provider" && (
            <div className="mt-2">
              {config.hasProvider ? (
                <p className="text-xs text-blue-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Proveedor conectado{config.providerName ? `: ${config.providerName}` : ""}
                </p>
              ) : (
                <p className="text-xs text-amber-400 font-medium">⚠ Sin proveedor configurado</p>
              )}
            </div>
          )}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-2 text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-100 px-4 py-2 rounded-lg transition-colors"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Guardar configuración
        </button>
        {saved && <p className="text-xs text-emerald-400">Guardado</p>}
      </div>
    </section>
  )
}

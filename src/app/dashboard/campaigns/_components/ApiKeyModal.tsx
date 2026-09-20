"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { rotateApiKeyAction } from "@/domains/campaigns/actions"
import { Copy, Eye, EyeOff, RefreshCw, Check } from "lucide-react"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
  campaignName: string
  apiKey: string
}

export function ApiKeyModal({ open, onOpenChange, campaignId, campaignName, apiKey: initialKey }: Props) {
  const router = useRouter()
  const [currentKey, setCurrentKey] = useState(initialKey)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [rotating, startRotate] = useTransition()
  const [confirmRotate, setConfirmRotate] = useState(false)

  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://tu-dominio.com"

  function maskKey(key: string): string {
    if (key.length <= 12) return key
    return key.slice(0, 12) + "•".repeat(Math.min(key.length - 12, 20))
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(currentKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleRotate() {
    startRotate(async () => {
      const result = await rotateApiKeyAction(campaignId)
      if (result.apiKey) {
        setCurrentKey(result.apiKey)
        setConfirmRotate(false)
        router.refresh()
      }
    })
  }

  const snippet = `// En el submit handler de tu landing page:
const res = await fetch("${appUrl}/api/leads/ingest", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Campaign-Key": "${currentKey}"
  },
  body: JSON.stringify({
    event_id: crypto.randomUUID(), // idempotencia
    name: "Nombre Apellido",
    email: "email@ejemplo.com",
    phone: "04141234567",
    city: "Caracas",
    negocio: false,
    // Opcionales (Meta tracking):
    fbc: getCookie("_fbc"),
    fbp: getCookie("_fbp"),
    utm_source: urlParams.get("utm_source"),
    utm_medium: urlParams.get("utm_medium"),
    utm_campaign: urlParams.get("utm_campaign"),
    utm_content: urlParams.get("utm_content"),
    platform: "facebook",
    device: "mobile",
  })
})
const { leadId } = await res.json()`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>API Key — {campaignName}</DialogTitle>
          <DialogDescription>
            Usa esta clave en el header <code className="text-indigo-400 bg-indigo-400/10 px-1 rounded">X-Campaign-Key</code> para enviar leads a esta campaña.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Key display */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-emerald-400 break-all">
                {revealed ? currentKey : maskKey(currentKey)}
              </code>
              <button
                onClick={() => setRevealed((v) => !v)}
                className="shrink-0 p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                title={revealed ? "Ocultar" : "Revelar"}
              >
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                onClick={handleCopy}
                className="shrink-0 p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                title="Copiar"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Rotate */}
            <div className="border-t border-zinc-700 pt-3 flex items-center gap-2">
              {confirmRotate ? (
                <>
                  <p className="text-xs text-amber-400 flex-1">
                    Rotar invalida la clave actual. Las landing pages dejarán de funcionar hasta que actualices el código.
                  </p>
                  <button
                    onClick={handleRotate}
                    disabled={rotating}
                    className="text-xs px-2.5 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50"
                  >
                    {rotating ? "Rotando…" : "Confirmar"}
                  </button>
                  <button
                    onClick={() => setConfirmRotate(false)}
                    className="text-xs px-2.5 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-zinc-500 flex-1">Rota la clave si crees que fue comprometida.</p>
                  <button
                    onClick={() => setConfirmRotate(true)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-zinc-600 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Rotar clave
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Code snippet */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Snippet para tu landing page</p>
            <div className="relative rounded-lg border border-zinc-700 bg-zinc-950 overflow-hidden">
              <pre className="p-4 text-xs text-zinc-300 font-mono overflow-x-auto leading-relaxed">
                {snippet}
              </pre>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(snippet)
                }}
                className="absolute top-2 right-2 p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                title="Copiar snippet"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

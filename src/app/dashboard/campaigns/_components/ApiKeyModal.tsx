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
import { Copy, Eye, EyeOff, RefreshCw, Check, Code2 } from "lucide-react"
import { PlatformSnippetStep } from "./PlatformSnippetStep"

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
  const [showPlatform, setShowPlatform] = useState(false)

  const appUrl = typeof window !== "undefined" ? window.location.origin : ""

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

  function handleClose(open: boolean) {
    if (!open) {
      setShowPlatform(false)
      setConfirmRotate(false)
      setRevealed(false)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>API Key — {campaignName}</DialogTitle>
          {!showPlatform && (
            <DialogDescription>
              Copia la clave o genera el script de instalación para tu plataforma.
            </DialogDescription>
          )}
        </DialogHeader>

        {!showPlatform ? (
          <div className="space-y-5">
            {/* Key display */}
            <div className="rounded-lg border border-ops-bd bg-ops-s2/60 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono text-ops-green break-all">
                  {revealed ? currentKey : maskKey(currentKey)}
                </code>
                <button
                  onClick={() => setRevealed((v) => !v)}
                  className="shrink-0 p-1.5 rounded text-ops-tx3 hover:text-ops-tx hover:bg-ops-sel transition-colors"
                  title={revealed ? "Ocultar" : "Revelar"}
                >
                  {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  onClick={handleCopy}
                  className="shrink-0 p-1.5 rounded text-ops-tx3 hover:text-ops-tx hover:bg-ops-sel transition-colors"
                  title="Copiar"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-ops-green" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Rotate */}
              <div className="border-t border-ops-bd pt-3 flex items-center gap-2">
                {confirmRotate ? (
                  <>
                    <p className="text-xs text-ops-amber flex-1">
                      Rotar invalida la clave actual. Las integraciones dejarán de funcionar hasta que actualices el código.
                    </p>
                    <button
                      onClick={handleRotate}
                      disabled={rotating}
                      className="text-xs px-2.5 py-1.5 rounded bg-ops-amber hover:bg-ops-amber text-white transition-colors disabled:opacity-50"
                    >
                      {rotating ? "Rotando…" : "Confirmar"}
                    </button>
                    <button
                      onClick={() => setConfirmRotate(false)}
                      className="text-xs px-2.5 py-1.5 rounded bg-ops-sel hover:bg-ops-bd2 text-ops-tx transition-colors"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-ops-tx3 flex-1">Rota la clave si crees que fue comprometida.</p>
                    <button
                      onClick={() => setConfirmRotate(true)}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-ops-bd2 text-ops-tx2 hover:text-ops-tx hover:border-ops-bd2 transition-colors"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Rotar clave
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Get install script */}
            <button
              onClick={() => setShowPlatform(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-ops-bd text-ops-tx hover:border-ops-blue/50 hover:bg-ops-blue/10 hover:text-ops-blue-t transition-colors text-sm"
            >
              <Code2 className="h-4 w-4" />
              Generar script de instalación paso a paso
            </button>
          </div>
        ) : (
          <PlatformSnippetStep
            config={{ mode: "single", apiKey: currentKey, campaignName }}
            appUrl={appUrl}
            onBack={() => setShowPlatform(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

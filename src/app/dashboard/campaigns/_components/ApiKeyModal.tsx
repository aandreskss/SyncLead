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
                      Rotar invalida la clave actual. Las integraciones dejarán de funcionar hasta que actualices el código.
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

            {/* Get install script */}
            <button
              onClick={() => setShowPlatform(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-zinc-700 text-zinc-300 hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors text-sm"
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

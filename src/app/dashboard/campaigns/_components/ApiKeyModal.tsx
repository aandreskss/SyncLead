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

  const snippet = `<!-- ── PASO 1: Pega en el <head> de tu web (WordPress, Shopify, cualquier plataforma) ── -->
<script>
  window.SyncLeadKey  = "${currentKey}";
  window.SyncLeadHost = "${appUrl}";
</script>
<script src="${appUrl}/sl.js" defer></script>

<!-- ── PASO 2: Llama a SyncLead.capture() cuando el lead se registre ── -->
<!-- Ejemplo: formulario HTML -->
<script>
document.getElementById("mi-formulario").addEventListener("submit", function(e) {
  e.preventDefault();
  SyncLead.capture({
    name:    document.getElementById("nombre").value,   // requerido
    email:   document.getElementById("email").value,   // requerido (o phone)
    phone:   document.getElementById("telefono").value, // requerido (o email)
    city:    document.getElementById("ciudad").value,   // opcional
    negocio: false,                                     // opcional
    // Los UTMs y fbclid se capturan y adjuntan automáticamente
  }).then(function(r) {
    if (r.success) console.log("Lead registrado:", r.leadId);
  });
});
</script>

<!-- ── Shopify: en theme.liquid antes de </body> ── -->
<!--
<script>
  // En la página de checkout cuando el cliente ingresa su email:
  SyncLead.capture({
    name:  customer.name,
    email: customer.email,
    phone: customer.phone,
  });
</script>
-->

<!-- ── WordPress: vía WPCode o functions.php ── -->
<!--
  Agrega el Paso 1 en: Ajustes → WPCode → Header Scripts
  Llama a SyncLead.capture() desde tu plugin de formularios
  (Contact Form 7, WPForms, Gravity Forms, etc.)
-->`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>API Key — {campaignName}</DialogTitle>
          <DialogDescription>
            Script universal para WordPress, Shopify, Next.js o cualquier web. Copia el snippet de instalación y llama a <code className="text-indigo-400 bg-indigo-400/10 px-1 rounded">SyncLead.capture()</code> donde capturas el lead.
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

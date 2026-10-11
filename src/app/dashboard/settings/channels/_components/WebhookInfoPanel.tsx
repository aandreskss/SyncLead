"use client"

import { useState } from "react"
import { Panel } from "@/components/app/ops"
import { CheckCircle2, Copy } from "lucide-react"

interface WabaWebhookInfo {
  wabaId: string
  displayName: string
  webhookVerifyToken: string | null
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className="ml-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-ops-tx3 hover:bg-ops-s2 hover:text-ops-tx transition-colors"
      title="Copiar"
    >
      {copied ? <CheckCircle2 className="h-3 w-3 text-ops-green" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  )
}

export function WebhookInfoPanel({ wabas }: { wabas: WabaWebhookInfo[] }) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tu-dominio.vercel.app"

  return (
    <Panel
      title="Configuración de webhook"
      description="Datos necesarios para configurar el webhook en Meta for Developers → WhatsApp → Configuración."
    >
      <div className="divide-y divide-ops-line">
        {wabas.map(waba => {
          const webhookUrl = `${appUrl}/api/webhook/wa-cloud/${waba.wabaId}`
          return (
            <div key={waba.wabaId} className="px-5 py-4 space-y-3">
              <p className="text-sm font-semibold text-ops-tx">{waba.displayName}</p>

              <div>
                <p className="text-xs text-ops-tx3 mb-1">URL del callback</p>
                <div className="flex items-center gap-2 rounded-lg border border-ops-bd bg-ops-s1 px-3 py-2">
                  <code className="flex-1 text-xs text-ops-tx break-all">{webhookUrl}</code>
                  <CopyButton value={webhookUrl} />
                </div>
              </div>

              <div>
                <p className="text-xs text-ops-tx3 mb-1">Token de verificación</p>
                {waba.webhookVerifyToken ? (
                  <div className="flex items-center gap-2 rounded-lg border border-ops-bd bg-ops-s1 px-3 py-2">
                    <code className="flex-1 text-xs text-ops-tx font-mono">{waba.webhookVerifyToken}</code>
                    <CopyButton value={waba.webhookVerifyToken} />
                  </div>
                ) : (
                  <p className="text-xs text-ops-coral">Token no disponible — reconecta la cuenta.</p>
                )}
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                <p className="text-xs text-blue-800">
                  <strong>Pasos en Meta for Developers:</strong> App → WhatsApp → Configuración → Webhooks → Editar →
                  pega la URL y el token → Verificar y guardar → suscríbete al campo <code>messages</code>.
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

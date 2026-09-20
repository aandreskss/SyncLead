"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { enableLeadAdsAction, disableLeadAdsAction } from "@/domains/meta/actions"
import type { MetaConnectionPublic } from "@/domains/meta/actions"
import { ChevronDown, ChevronUp, Copy, Check, Globe, Zap, Info, User, MapPin, ShoppingCart } from "lucide-react"

interface Props {
  clientId: string
  metaConnections: MetaConnectionPublic[]
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    }).catch(() => undefined)
  }
  return { copied, copy }
}

function CopyButton({ text, copyKey }: { text: string; copyKey: string }) {
  const { copied, copy } = useCopy()
  return (
    <button
      onClick={() => copy(text, copyKey)}
      className="flex-shrink-0 p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
      title="Copiar"
    >
      {copied === copyKey ? (
        <Check className="h-4 w-4 text-emerald-400" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  )
}

function CodeBlock({ value, copyKey }: { value: string; copyKey: string }) {
  return (
    <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-sm">
      <span className="text-zinc-300 break-all flex-1">{value}</span>
      <CopyButton text={value} copyKey={copyKey} />
    </div>
  )
}

export function LeadSourcesPanel({ clientId, metaConnections }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pageIdInput, setPageIdInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [utmOpen, setUtmOpen] = useState(false)

  // Get the first connection (most orgs have one)
  const conn = metaConnections[0]
  const leadAdsEnabled = conn?.leadAdsEnabled ?? false
  const webhookVerifyToken = conn?.webhookVerifyToken ?? null
  const metaPageId = conn?.metaPageId ?? null
  const captureScriptKey = conn?.captureScriptKey ?? null

  const [capturePreset, setCapturePreset] = useState<"basic" | "location" | "ecommerce">("basic")

  const appUrl = typeof window !== "undefined" ? window.location.origin : ""
  const webhookUrl = `${appUrl}/api/webhook/meta/${clientId}`
  const captureScriptSrc = `${appUrl}/api/capture/${clientId}?preset=${capturePreset}`

  function handleEnable() {
    setError(null)
    startTransition(async () => {
      const result = await enableLeadAdsAction(clientId, pageIdInput)
      if (!result.success) {
        setError(result.error ?? "Error desconocido")
      } else {
        setPageIdInput("")
        router.refresh()
      }
    })
  }

  function handleDisable() {
    setError(null)
    startTransition(async () => {
      await disableLeadAdsAction(clientId)
      router.refresh()
    })
  }

  return (
    <div className="space-y-8">
      {/* ─── Section 1: Meta Lead Ads ───────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
            <Zap className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Meta Lead Ads</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Recibe leads de formularios nativos de Facebook e Instagram automáticamente, sin instalar nada en tu sitio.
            </p>
          </div>
          {leadAdsEnabled && (
            <span className="ml-auto flex-shrink-0 flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium text-emerald-400 bg-emerald-400/10">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Activo
            </span>
          )}
        </div>

        {leadAdsEnabled && metaPageId && webhookVerifyToken ? (
          <div className="ml-11 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">URL del webhook</label>
              <CodeBlock value={webhookUrl} copyKey="webhook-url" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Token de verificacion</label>
              <CodeBlock value={webhookVerifyToken} copyKey="verify-token" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Facebook Page ID configurado</label>
              <div className="text-xs text-zinc-400 bg-zinc-800/50 rounded px-3 py-2 border border-zinc-700">
                {metaPageId}
              </div>
            </div>

            {/* Setup steps guide */}
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-4 space-y-3">
              <p className="text-xs font-semibold text-zinc-300">Pasos para configurar el webhook en Meta:</p>
              <ol className="space-y-1.5 list-decimal list-inside">
                {[
                  "Copia la URL del webhook de arriba.",
                  "En Meta Business Manager → Configuracion → Webhooks → Nueva suscripcion → Paginas → leadgen.",
                  "Pega la URL y el token de verificacion.",
                  'Activa la casilla "leadgen" y guarda.',
                ].map((step, i) => (
                  <li key={i} className="text-xs text-zinc-400">
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <button
              onClick={handleDisable}
              disabled={isPending}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              Desactivar Lead Ads
            </button>
          </div>
        ) : (
          <div className="ml-11 space-y-4">
            {!conn && (
              <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2 border border-amber-400/20">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>Primero conecta una cuenta de Meta Ads en el panel de Configuracion.</span>
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={pageIdInput}
                onChange={(e) => setPageIdInput(e.target.value)}
                placeholder="Facebook Page ID (ej: 123456789)"
                disabled={!conn || isPending}
                className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
              />
              <button
                onClick={handleEnable}
                disabled={!conn || !pageIdInput.trim() || isPending}
                className="flex-shrink-0 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? "Activando..." : "Activar"}
              </button>
            </div>
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800" />

      {/* ─── Section 2: Capture script ──────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <Globe className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Formularios del sitio web</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Captura leads cuando alguien llena un formulario en el sitio web del cliente. Solo funciona si el visitante viene de un anuncio de Meta.
            </p>
          </div>
        </div>

        <div className="ml-11 space-y-4">
          {/* Preset selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Campos que captura el script</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                {
                  key: "basic" as const,
                  icon: User,
                  label: "Básico",
                  fields: "Nombre · Email · Teléfono",
                },
                {
                  key: "location" as const,
                  icon: MapPin,
                  label: "Con ubicación",
                  fields: "Nombre · Email · Teléfono · Ciudad",
                },
                {
                  key: "ecommerce" as const,
                  icon: ShoppingCart,
                  label: "E-commerce",
                  fields: "Nombre · Email · Teléfono · Ciudad · Método de pago",
                },
              ] as const).map(({ key, icon: Icon, label, fields }) => (
                <button
                  key={key}
                  onClick={() => setCapturePreset(key)}
                  className={`flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    capturePreset === key
                      ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                      : "border-zinc-700 bg-zinc-800/30 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </span>
                  <span className="text-[10px] leading-relaxed opacity-80">{fields}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Script de captura</label>
            <CodeBlock
              value={`<script src="${captureScriptSrc}" defer></script>`}
              copyKey="capture-script"
            />
          </div>
          <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-800/30 rounded-lg px-3 py-2 border border-zinc-700">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-zinc-400" />
            <span>
              Pega este script en el{" "}
              <code className="text-zinc-300 bg-zinc-700/50 px-1 rounded">&lt;head&gt;</code>{" "}
              de cada pagina con formulario. El script se activa solo si el visitante viene de un anuncio de Meta.
            </span>
          </div>
          {!captureScriptKey && (
            <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2 border border-amber-400/20">
              <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>Activa Meta Lead Ads primero para habilitar el script de captura.</span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-zinc-800" />

      {/* ─── Section 3: UTM guide (collapsible) ─────────────────────── */}
      <div className="space-y-3">
        <button
          onClick={() => setUtmOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100">
              Configura los parametros UTM en tus anuncios
            </span>
          </div>
          {utmOpen ? (
            <ChevronUp className="h-4 w-4 text-zinc-400 flex-shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-400 flex-shrink-0" />
          )}
        </button>

        {utmOpen && (
          <div className="space-y-4 pl-0">
            <p className="text-xs text-zinc-400">
              Para que SyncLead pueda rastrear que anuncio genero cada lead, configura estos parametros en cada anuncio de Meta:
            </p>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Parametros UTM</label>
              <CodeBlock
                value="utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}"
                copyKey="utm-params"
              />
            </div>

            <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-4 space-y-3">
              <p className="text-xs font-semibold text-zinc-300">Pasos en Meta Ads Manager:</p>
              <ol className="space-y-1.5 list-decimal list-inside">
                {[
                  "Ve al anuncio en Meta Ads Manager.",
                  'En "Destino" o "URL del sitio web", haz clic en "Parametros de URL".',
                  "Pega los parametros de arriba.",
                  'Meta rellenara automaticamente {{campaign.name}}, {{ad.name}} y {{adset.name}}.',
                ].map((step, i) => (
                  <li key={i} className="text-xs text-zinc-400">
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex items-start gap-2 text-xs text-indigo-400 bg-indigo-400/10 rounded-lg px-3 py-2 border border-indigo-400/20">
              <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Si usas formularios nativos de Meta (Lead Ads)</strong>, no necesitas UTMs —{" "}
                la atribucion es automatica.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

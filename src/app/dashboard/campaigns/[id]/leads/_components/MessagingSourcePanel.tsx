"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronDown, ChevronUp, CheckCircle2, Unplug, Eye, EyeOff,
  Copy, Check, MessageSquare, Camera, ExternalLink, Info,
} from "lucide-react"
import { saveIgSourceAction, deleteIgSourceAction } from "@/domains/ig-messages/actions"
import type { IgMessageSourcePublic } from "@/domains/ig-messages/repository"

interface Props {
  campaignId: string
  igSource: IgMessageSourcePublic | null
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => undefined)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="ml-1.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium border border-ops-bd text-ops-tx3 hover:text-ops-tx hover:border-ops-blue/40 transition-colors"
    >
      {copied ? <Check className="h-2.5 w-2.5 text-ops-green" /> : <Copy className="h-2.5 w-2.5" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  )
}

function WaCtwaSection() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-ops-line bg-white overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 flex-shrink-0">
            <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ops-tx">WhatsApp Click-to-WhatsApp</p>
            <p className="text-xs text-ops-tx3 mt-0.5">Automático · requiere Catalog Sync activo</p>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-ops-tx3" /> : <ChevronDown className="h-4 w-4 text-ops-tx3" />}
      </button>

      {open && (
        <div className="border-t border-ops-line px-4 pb-4 pt-3 space-y-3">
          <p className="text-xs text-ops-tx2">
            Cuando alguien hace clic en tu anuncio de Meta con CTA <strong>"Enviar mensaje a WhatsApp"</strong>,
            SyncLead crea el lead automáticamente al recibir el primer mensaje. No necesitas configurar nada extra aquí.
          </p>

          <div className="rounded-lg bg-ops-blue-bg border border-ops-blue/20 p-3 space-y-2">
            <p className="text-xs font-semibold text-ops-blue flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" />
              ¿Qué es el Catalog Sync?
            </p>
            <p className="text-xs text-ops-tx2 leading-relaxed">
              El <strong>Catalog Sync</strong> es la función en <strong>Dashboard → Performance → Insights</strong> donde conectas tu cuenta de Meta Ads.
              SyncLead descarga tu catálogo de campañas, conjuntos de anuncios y anuncios, y lo usa para saber
              a qué campaña de SyncLead pertenece cada mensaje entrante de WhatsApp.
            </p>
            <p className="text-xs text-ops-tx3">
              Sin Catalog Sync activo, los mensajes CTWA no se pueden asignar a ninguna campaña y no se crean leads.
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-ops-tx2 mb-1.5">Pasos para activar:</p>
            <ol className="space-y-1">
              {[
                "Ve a Dashboard → Performance → pestaña Insights",
                "Conecta tu cuenta de Meta Ads (Ad Account ID)",
                "Activa el Sync — SyncLead descarga el catálogo de anuncios",
                "En el panel de Insights, vincula tu campaña de Meta a esta campaña de SyncLead",
                "Desde ese momento, los mensajes CTWA se asignan automáticamente aquí",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-ops-tx3">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[9px] font-bold text-emerald-600">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <a
            href="/dashboard/performance?tab=insights"
            className="inline-flex items-center gap-1.5 text-xs text-ops-blue hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Ir a Insights / Catalog Sync
          </a>
        </div>
      )}
    </div>
  )
}

function IgDmSection({ campaignId, igSource }: { campaignId: string; igSource: IgMessageSourcePublic | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(!!igSource)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [currentSource, setCurrentSource] = useState<IgMessageSourcePublic | null>(igSource)

  const appUrl = typeof window !== "undefined" ? window.location.origin : ""
  const webhookUrl = `${appUrl}/api/webhook/instagram-messages`

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const input = {
      igPageId: (fd.get("igPageId") as string).trim(),
      pageAccessToken: (fd.get("pageAccessToken") as string).trim(),
    }
    startTransition(async () => {
      try {
        const result = await saveIgSourceAction(campaignId, input)
        if (!result.success) { setError(result.error ?? "Error al guardar"); return }
        if (result.source) setCurrentSource(result.source)
        router.refresh()
      } catch { setError("Error inesperado") }
    })
  }

  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setError(null)
    startTransition(async () => {
      try {
        const result = await deleteIgSourceAction(campaignId)
        if (!result.success) { setError(result.error ?? "Error al eliminar"); return }
        setCurrentSource(null)
        setConfirmDelete(false)
        router.refresh()
      } catch { setError("Error inesperado") }
    })
  }

  return (
    <div className="rounded-lg border border-ops-line bg-white overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-pink-500/15 flex-shrink-0">
            <Camera className="h-3.5 w-3.5 text-pink-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ops-tx">Instagram DM</p>
            {currentSource ? (
              <p className="text-xs text-ops-green flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="h-3 w-3" />
                Configurado · Página {currentSource.igPageId}
              </p>
            ) : (
              <p className="text-xs text-ops-tx3 mt-0.5">Recibe leads de anuncios con CTA "Enviar mensaje a Instagram"</p>
            )}
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-ops-tx3" /> : <ChevronDown className="h-4 w-4 text-ops-tx3" />}
      </button>

      {open && (
        <div className="border-t border-ops-line px-4 pb-4 pt-3 space-y-4">
          {/* Permissions required */}
          <div className="rounded-lg bg-ops-s2 border border-ops-line p-3 text-xs text-ops-tx3 space-y-1.5">
            <p className="font-medium text-ops-tx2">Permisos requeridos en tu Meta App:</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {["instagram_manage_messages", "instagram_basic", "pages_show_list"].map(p => (
                <span key={p} className="font-mono bg-ops-s1 border border-ops-line rounded px-1.5 py-0.5 text-[10px]">{p}</span>
              ))}
            </div>
          </div>

          {/* Webhook URL + Verify Token (shown once configured) */}
          {currentSource && (
            <div className="space-y-2.5 rounded-lg bg-ops-blue-bg border border-ops-blue/20 p-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ops-blue mb-1">URL del Webhook (configurar en Meta)</p>
                <div className="flex items-center gap-1">
                  <code className="text-xs text-ops-tx2 break-all">{webhookUrl}</code>
                  <CopyButton text={webhookUrl} />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ops-blue mb-1">Token de Verificación</p>
                <div className="flex items-center gap-1">
                  <code className="text-xs font-mono text-ops-tx2">{currentSource.verifyToken}</code>
                  <CopyButton text={currentSource.verifyToken} />
                </div>
              </div>
              <p className="text-[10px] text-ops-tx3">
                Configura estos valores en Meta Developers → tu App → Webhooks → instagram → Suscribir a <code>messages</code>.
              </p>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-ops-tx2 mb-1.5">
                Page ID <span className="text-ops-coral">*</span>
                <span className="font-normal text-ops-tx3 ml-1">— el ID numérico de tu Página de Facebook/Instagram</span>
              </label>
              <input
                name="igPageId"
                type="text"
                required
                defaultValue={currentSource?.igPageId ?? ""}
                placeholder="Ej. 123456789012345"
                className="w-full rounded-lg border border-ops-bd bg-ops-s2 px-3 py-2 text-sm text-ops-tx placeholder-ops-tx3 focus:outline-none focus:border-ops-blue transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ops-tx2 mb-1.5">
                Page Access Token {!currentSource && <span className="text-ops-coral">*</span>}
              </label>
              <div className="relative">
                <input
                  name="pageAccessToken"
                  type={showToken ? "text" : "password"}
                  required={!currentSource}
                  placeholder={currentSource ? "•••••••• (dejar vacío para no cambiar)" : "EAAxxxxxxxxxxxxxxxx…"}
                  className="w-full rounded-lg border border-ops-bd bg-ops-s2 px-3 py-2 pr-10 text-sm text-ops-tx placeholder-ops-tx3 focus:outline-none focus:border-ops-blue transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ops-tx3 hover:text-ops-tx"
                >
                  {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {currentSource && (
                <p className="text-xs text-ops-tx3 mt-1">Token guardado cifrado. Solo ingresa uno nuevo si lo quieres reemplazar.</p>
              )}
            </div>

            {error && (
              <p className="rounded-lg bg-ops-coral/10 border border-ops-coral/30 px-3 py-2 text-xs text-ops-coral">{error}</p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ops-blue px-4 text-xs font-medium text-white hover:bg-ops-blue/90 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Guardando…" : currentSource ? "Actualizar" : "Guardar configuración"}
              </button>

              {currentSource && (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ops-coral">¿Desconectar Instagram?</span>
                    <button type="button" onClick={handleDelete} disabled={isPending} className="text-xs text-ops-coral font-medium disabled:opacity-50">
                      {isPending ? "Eliminando…" : "Confirmar"}
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-ops-tx3 hover:text-ops-tx">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ops-bd px-4 text-xs text-ops-tx3 hover:text-ops-coral hover:border-red-500/30 transition-colors"
                  >
                    <Unplug className="h-3.5 w-3.5" />
                    Desconectar
                  </button>
                )
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export function MessagingSourcePanel({ campaignId, igSource }: Props) {
  const [open, setOpen] = useState(true)

  return (
    <div className="rounded-xl border border-ops-bd bg-ops-s1">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-ops-blue rounded-xl"
      >
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-ops-blue/10 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="h-3.5 w-3.5 text-ops-blue" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ops-tx">Fuentes de mensajes</p>
            <p className="text-xs text-ops-tx3 mt-0.5">WhatsApp CTWA · Instagram DM</p>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-ops-tx3" /> : <ChevronDown className="h-4 w-4 text-ops-tx3" />}
      </button>

      {open && (
        <div className="border-t border-ops-line px-5 pb-5 pt-4 space-y-3">
          <WaCtwaSection />
          <IgDmSection campaignId={campaignId} igSource={igSource} />
        </div>
      )}
    </div>
  )
}

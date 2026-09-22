"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp, CheckCircle2, Unplug, Eye, EyeOff } from "lucide-react"
import { saveLeadAdSourceAction, deleteLeadAdSourceAction } from "@/domains/lead-ads/actions"

interface Props {
  campaignId: string
  existing: { pageId: string; formId?: string | null; active?: boolean } | null
}

export function LeadAdsPanel({ campaignId, existing }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(!!existing)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const input = {
      pageId: (fd.get("pageId") as string).trim(),
      formId: (fd.get("formId") as string).trim() || null,
      pageAccessToken: (fd.get("pageAccessToken") as string).trim(),
    }
    startTransition(async () => {
      try {
        const result = await saveLeadAdSourceAction(campaignId, input)
        if (!result.success) { setError(result.error ?? "Error al guardar"); return }
        router.refresh()
      } catch { setError("Error inesperado") }
    })
  }

  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setError(null)
    startTransition(async () => {
      try {
        const result = await deleteLeadAdSourceAction(campaignId)
        if (!result.success) { setError(result.error ?? "Error al eliminar"); return }
        setConfirmDelete(false)
        router.refresh()
      } catch { setError("Error inesperado") }
    })
  }

  return (
    <div className="rounded-xl border border-ops-bd bg-ops-s1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-ops-blue rounded-xl"
      >
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-[#1877F2]/15 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
              <path d="M18 9a9 9 0 1 0-10.406 8.894v-6.29H5.309V9h2.285V7.017c0-2.255 1.344-3.502 3.4-3.502.984 0 2.014.175 2.014.175v2.215h-1.135c-1.118 0-1.466.694-1.466 1.406V9h2.496l-.399 2.604H10.41v6.29A9.003 9.003 0 0 0 18 9Z" fill="#1877F2"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-ops-tx">Meta Lead Ads</p>
            {existing ? (
              <p className="text-xs text-ops-green flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="h-3 w-3" />
                Configurado · Página {existing.pageId}{existing.formId ? ` · Form ${existing.formId}` : ""}
              </p>
            ) : (
              <p className="text-xs text-ops-tx3 mt-0.5">Recibe leads directo del formulario nativo de Facebook</p>
            )}
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-ops-tx3" /> : <ChevronDown className="h-4 w-4 text-ops-tx3" />}
      </button>

      {open && (
        <div className="border-t border-ops-line px-5 pb-5 pt-4 space-y-4">
          {/* Setup instructions */}
          <div className="rounded-lg bg-ops-s2 border border-ops-line p-3 text-xs text-ops-tx3 space-y-1">
            <p className="font-medium text-ops-tx2">Pasos para configurar en Meta:</p>
            <ol className="list-decimal list-inside space-y-1 ml-1">
              <li>Crea una <strong className="text-ops-tx2">Meta App</strong> en <span className="font-mono">developers.facebook.com</span></li>
              <li>En tu App → Productos → Webhooks: agrega tu URL y pega el token de verificación</li>
              <li>URL del webhook: <span className="font-mono text-ops-blue-t">{`${process.env.NEXT_PUBLIC_APP_URL ?? "https://tu-dominio.com"}/api/webhook/meta-leads`}</span></li>
              <li>Token de verificación: copia el valor de <span className="font-mono">META_LEAD_ADS_VERIFY_TOKEN</span> en tus env vars</li>
              <li>Suscribe tu Página al evento <span className="font-mono">leadgen</span></li>
              <li>Obtén un <strong className="text-ops-tx2">Page Access Token</strong> con permisos <span className="font-mono">leads_retrieval</span> + <span className="font-mono">pages_manage_ads</span></li>
            </ol>
          </div>

          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-ops-tx2 mb-1.5">
                Page ID <span className="text-ops-coral">*</span>
                <span className="font-normal text-ops-tx3 ml-1">— el ID numérico de tu página de Facebook</span>
              </label>
              <input
                name="pageId"
                type="text"
                required
                defaultValue={existing?.pageId ?? ""}
                placeholder="Ej. 123456789012345"
                className="w-full rounded-lg border border-ops-bd bg-ops-s2 px-3 py-2 text-sm text-ops-tx placeholder-ops-tx3 focus:outline-none focus:border-ops-blue transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ops-tx2 mb-1.5">
                Form ID
                <span className="font-normal text-ops-tx3 ml-1">— opcional; vacío = aceptar todos los formularios de la página</span>
              </label>
              <input
                name="formId"
                type="text"
                defaultValue={existing?.formId ?? ""}
                placeholder="Ej. 987654321098765 (opcional)"
                className="w-full rounded-lg border border-ops-bd bg-ops-s2 px-3 py-2 text-sm text-ops-tx placeholder-ops-tx3 focus:outline-none focus:border-ops-blue transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ops-tx2 mb-1.5">
                Page Access Token <span className="text-ops-coral">*</span>
              </label>
              <div className="relative">
                <input
                  name="pageAccessToken"
                  type={showToken ? "text" : "password"}
                  required
                  placeholder={existing ? "••••••••  (dejar vacío para no cambiar)" : "EAAxxxxxxxxxxxxxxxx…"}
                  className="w-full rounded-lg border border-ops-bd bg-ops-s2 px-3 py-2 pr-10 text-sm text-ops-tx placeholder-ops-tx3 focus:outline-none focus:border-ops-blue transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ops-tx3 hover:text-ops-tx"
                >
                  {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {existing && (
                <p className="text-xs text-ops-tx3 mt-1">Token guardado. Solo ingresa uno nuevo si quieres reemplazarlo.</p>
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
                {isPending ? "Guardando…" : existing ? "Actualizar" : "Guardar configuración"}
              </button>

              {existing && (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ops-coral">¿Eliminar configuración?</span>
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

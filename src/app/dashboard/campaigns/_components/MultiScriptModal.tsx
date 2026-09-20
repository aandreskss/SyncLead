"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Copy, Check, Code2, Star } from "lucide-react"
import type { CampaignWithClient } from "@/domains/campaigns/repository"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaigns: CampaignWithClient[]
  appUrl: string
}

export function MultiScriptModal({ open, onOpenChange, campaigns, appUrl }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [defaultId, setDefaultId] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const [step, setStep] = useState<"select" | "snippet">("select")

  const activeCampaigns = campaigns.filter((c) => c.active && c.apiKey)

  function toggleCampaign(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        if (defaultId === id) setDefaultId("")
      } else {
        next.add(id)
        if (next.size === 1) setDefaultId(id)
      }
      return next
    })
  }

  function selectAll() {
    const all = new Set(activeCampaigns.map((c) => c.id))
    setSelected(all)
    if (!defaultId && activeCampaigns.length > 0) setDefaultId(activeCampaigns[0].id)
  }

  function clearAll() {
    setSelected(new Set())
    setDefaultId("")
  }

  const selectedCampaigns = activeCampaigns.filter((c) => selected.has(c.id))

  function buildSnippet() {
    const host = appUrl

    // utm_campaign key to use in the map — use campaign name normalized to lowercase slug
    const entries = selectedCampaigns
      .map((c) => {
        const utmKey = c.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
        const isDefault = c.id === defaultId
        return `    "${utmKey}": "${c.apiKey}"${isDefault ? ", // ← fallback si no hay UTM" : ","}`
      })
      .join("\n")

    // If only one campaign selected, use simple mode
    if (selectedCampaigns.length === 1) {
      const c = selectedCampaigns[0]
      return `<!-- SyncLead — ${c.name} -->
<!-- Pega en el <head> de tu WordPress / Shopify / web -->
<script>
  window.SyncLeadKey  = "${c.apiKey}";
  window.SyncLeadHost = "${host}";
</script>
<script src="${host}/sl.js" defer></script>

<!-- Llama capture() donde obtienes los datos del lead -->
<script>
SyncLead.capture({
  name:  "Nombre del lead",   // requerido
  email: "email@ejemplo.com", // requerido (o phone)
  phone: "04141234567",       // requerido (o email)
  // Los UTMs y fbclid se adjuntan automáticamente
})
</script>`
    }

    const names = selectedCampaigns.map((c) => c.name).join(", ")

    return `<!-- SyncLead Multi-Campaña — ${names} -->
<!-- Pega en el <head> de tu WordPress / Shopify / web -->
<script>
  window.SyncLeadHost = "${host}";

  // El script elige automáticamente la campaña correcta
  // basándose en el utm_campaign del URL de entrada del usuario.
  // La clave "_default" se usa si no hay coincidencia de UTM.
  window.SyncLeadCampaigns = {
${entries}
  };
</script>
<script src="${host}/sl.js" defer></script>

<!-- Llama capture() donde obtienes los datos del lead -->
<!-- El API key se selecciona automáticamente por UTM -->
<script>
SyncLead.capture({
  name:  "Nombre del lead",   // requerido
  email: "email@ejemplo.com", // requerido (o phone)
  phone: "04141234567",       // requerido (o email)
  // Los UTMs y fbclid se adjuntan automáticamente
})
</script>`
  }

  const snippet = step === "snippet" ? buildSnippet() : ""

  async function handleCopy() {
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleClose(open: boolean) {
    if (!open) {
      setStep("select")
      setSelected(new Set())
      setDefaultId("")
      setCopied(false)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-indigo-400" />
            Script Multi-Campaña
          </DialogTitle>
          <DialogDescription>
            Selecciona las campañas a incluir. El script resultante detecta automáticamente cuál usar según el utm_campaign del visitante.
          </DialogDescription>
        </DialogHeader>

        {step === "select" ? (
          <div className="space-y-4">
            {activeCampaigns.length === 0 ? (
              <p className="text-zinc-500 text-sm py-4 text-center">
                No hay campañas activas con API key disponible.
              </p>
            ) : (
              <>
                {/* Select all / clear */}
                <div className="flex gap-3 text-xs">
                  <button onClick={selectAll} className="text-indigo-400 hover:text-indigo-300 transition-colors">
                    Seleccionar todas
                  </button>
                  <span className="text-zinc-700">·</span>
                  <button onClick={clearAll} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                    Limpiar
                  </button>
                </div>

                {/* Campaign list */}
                <div className="space-y-1.5">
                  {activeCampaigns.map((campaign) => {
                    const isSelected = selected.has(campaign.id)
                    const isDefault = defaultId === campaign.id
                    const utmKey = campaign.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")

                    return (
                      <div
                        key={campaign.id}
                        onClick={() => toggleCampaign(campaign.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? "border-indigo-500/50 bg-indigo-500/10"
                            : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                        }`}
                      >
                        {/* Checkbox */}
                        <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected ? "bg-indigo-600 border-indigo-600" : "border-zinc-600"
                        }`}>
                          {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-100 truncate">{campaign.name}</span>
                            {campaign.client?.name && (
                              <span className="text-xs text-zinc-500 truncate">{campaign.client.name}</span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-600 mt-0.5 font-mono">
                            utm_campaign=<span className="text-zinc-400">{utmKey}</span>
                          </p>
                        </div>

                        {/* Default toggle */}
                        {isSelected && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDefaultId(campaign.id) }}
                            title="Usar como fallback cuando no hay UTM"
                            className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors flex-shrink-0 ${
                              isDefault
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                : "text-zinc-600 hover:text-zinc-400"
                            }`}
                          >
                            <Star className="h-3 w-3" />
                            {isDefault ? "Default" : "Set default"}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Info box */}
                {selected.size > 1 && !defaultId && (
                  <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    Marca una campaña como <strong>Default</strong> (⭐) — se usará cuando el visitante no venga de ningún UTM conocido.
                  </p>
                )}

                {selected.size > 0 && defaultId && (
                  <p className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                    El visitante que llegue sin UTM o con un UTM desconocido se registrará bajo la campaña default.
                  </p>
                )}

                {/* Generate button */}
                <div className="flex justify-end pt-2 border-t border-zinc-800">
                  <button
                    onClick={() => setStep("snippet")}
                    disabled={selected.size === 0 || (selected.size > 1 && !defaultId)}
                    className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Generar snippet ({selected.size} {selected.size === 1 ? "campaña" : "campañas"})
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Back */}
            <button
              onClick={() => setStep("select")}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ← Cambiar selección
            </button>

            {/* Snippet */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Snippet listo para instalar
              </p>
              <div className="relative rounded-lg border border-zinc-700 bg-zinc-950 overflow-hidden">
                <pre className="p-4 text-xs text-zinc-300 font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
                  {snippet}
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors text-xs"
                  title="Copiar snippet"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>

            {/* How it works */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-2 text-xs text-zinc-400">
              <p className="font-medium text-zinc-300">Cómo funciona la detección automática</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>El visitante llega desde un anuncio con <code className="text-indigo-400">?utm_campaign=nombre</code></li>
                <li>El script guarda ese UTM en localStorage del navegador</li>
                <li>Cuando llamas a <code className="text-indigo-400">SyncLead.capture()</code>, busca el UTM guardado</li>
                <li>Elige el API key de la campaña que coincide y registra el lead ahí</li>
                <li>Si no hay coincidencia, usa la campaña marcada como Default</li>
              </ol>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

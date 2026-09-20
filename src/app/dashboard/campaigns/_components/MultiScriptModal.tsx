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

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
}

export function MultiScriptModal({ open, onOpenChange, campaigns, appUrl }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [utmKeys, setUtmKeys] = useState<Map<string, string>>(new Map())
  const [defaultId, setDefaultId] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const [step, setStep] = useState<"select" | "snippet">("select")

  const activeCampaigns = campaigns.filter((c) => c.active && c.apiKey)
  const selectedCampaigns = activeCampaigns.filter((c) => selected.has(c.id))

  function toggleCampaign(id: string, name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        if (defaultId === id) setDefaultId("")
        setUtmKeys((m) => { const n = new Map(m); n.delete(id); return n })
      } else {
        next.add(id)
        // Pre-fill UTM key with slug of campaign name only if not already set
        setUtmKeys((m) => {
          const n = new Map(m)
          if (!n.has(id)) n.set(id, toSlug(name))
          return n
        })
        if (next.size === 1) setDefaultId(id)
      }
      return next
    })
  }

  function setUtmKey(id: string, value: string) {
    setUtmKeys((m) => { const n = new Map(m); n.set(id, value); return n })
  }

  function selectAll() {
    const all = new Set(activeCampaigns.map((c) => c.id))
    setSelected(all)
    setUtmKeys((m) => {
      const n = new Map(m)
      activeCampaigns.forEach((c) => { if (!n.has(c.id)) n.set(c.id, toSlug(c.name)) })
      return n
    })
    if (!defaultId && activeCampaigns.length > 0) setDefaultId(activeCampaigns[0].id)
  }

  function clearAll() {
    setSelected(new Set())
    setUtmKeys(new Map())
    setDefaultId("")
  }

  // Validates all selected campaigns have a non-empty UTM key
  const utmKeysValid = selectedCampaigns.every((c) => (utmKeys.get(c.id) ?? "").trim() !== "")
  const canGenerate = selected.size > 0 && utmKeysValid && (selected.size === 1 || !!defaultId)

  function buildSnippet() {
    if (selectedCampaigns.length === 1) {
      const c = selectedCampaigns[0]
      return `<!-- SyncLead — ${c.name} -->
<!-- Pega en el <head> de tu WordPress / Shopify / web -->
<script>
  window.SyncLeadKey  = "${c.apiKey}";
  window.SyncLeadHost = "${appUrl}";
</script>
<script src="${appUrl}/sl.js" defer></script>

<!-- Llama capture() donde capturas los datos del lead -->
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
    const entries = selectedCampaigns
      .map((c) => {
        const utmKey = (utmKeys.get(c.id) ?? "").trim()
        const isDefault = c.id === defaultId
        return `    "${utmKey}": "${c.apiKey}"${isDefault ? ", // ← fallback si no hay UTM" : ","}`
      })
      .join("\n")

    return `<!-- SyncLead Multi-Campaña — ${names} -->
<!-- Pega en el <head> de tu WordPress / Shopify / web -->
<script>
  window.SyncLeadHost = "${appUrl}";

  // El script detecta automáticamente cuál campaña usar
  // según el utm_campaign que llegó en el URL del visitante.
  window.SyncLeadCampaigns = {
${entries}
  };
</script>
<script src="${appUrl}/sl.js" defer></script>

<!-- Llama capture() donde capturas los datos del lead -->
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
      setUtmKeys(new Map())
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
            Selecciona las campañas e ingresa el valor exacto de <code className="text-indigo-400 bg-indigo-400/10 px-1 rounded">utm_campaign</code> que configuraste en Meta para cada una.
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
                <div className="space-y-2">
                  {activeCampaigns.map((campaign) => {
                    const isSelected = selected.has(campaign.id)
                    const isDefault = defaultId === campaign.id
                    const utmValue = utmKeys.get(campaign.id) ?? ""

                    return (
                      <div
                        key={campaign.id}
                        className={`rounded-lg border transition-colors ${
                          isSelected
                            ? "border-indigo-500/50 bg-indigo-500/10"
                            : "border-zinc-800 bg-zinc-900"
                        }`}
                      >
                        {/* Row header — clickable to toggle */}
                        <div
                          onClick={() => toggleCampaign(campaign.id, campaign.name)}
                          className="flex items-center gap-3 p-3 cursor-pointer"
                        >
                          {/* Checkbox */}
                          <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected ? "bg-indigo-600 border-indigo-600" : "border-zinc-600"
                          }`}>
                            {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>

                          {/* Campaign name + client */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-zinc-100 truncate">{campaign.name}</span>
                              {campaign.client?.name && (
                                <span className="text-xs text-zinc-500 truncate">{campaign.client.name}</span>
                              )}
                            </div>
                          </div>

                          {/* Default badge */}
                          {isSelected && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setDefaultId(campaign.id) }}
                              title="Usar como fallback cuando no hay UTM coincidente"
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

                        {/* UTM input — only visible when selected */}
                        {isSelected && (
                          <div
                            className="px-3 pb-3 pt-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-0 rounded-md border border-zinc-700 bg-zinc-900 overflow-hidden focus-within:border-indigo-500 transition-colors">
                              <span className="px-2.5 py-1.5 text-xs text-zinc-500 bg-zinc-800 border-r border-zinc-700 whitespace-nowrap font-mono select-none">
                                utm_campaign=
                              </span>
                              <input
                                type="text"
                                value={utmValue}
                                onChange={(e) => setUtmKey(campaign.id, e.target.value)}
                                placeholder="ej: zapatillas_oct_2025"
                                className="flex-1 px-2.5 py-1.5 text-xs text-zinc-100 font-mono bg-transparent focus:outline-none placeholder-zinc-600"
                              />
                            </div>
                            <p className="text-xs text-zinc-600 mt-1.5">
                              Debe coincidir exactamente con el valor configurado en tu anuncio de Meta.
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Warnings */}
                {selected.size > 1 && !defaultId && (
                  <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    Marca una campaña como <strong>Default</strong> (⭐) — se usará cuando el visitante no venga de ningún UTM conocido.
                  </p>
                )}
                {selected.size > 0 && !utmKeysValid && (
                  <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    Todas las campañas seleccionadas deben tener un valor de utm_campaign.
                  </p>
                )}

                {/* Generate button */}
                <div className="flex justify-end pt-2 border-t border-zinc-800">
                  <button
                    onClick={() => setStep("snippet")}
                    disabled={!canGenerate}
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
              ← Cambiar selección o UTMs
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
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>

            {/* How it works */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-2 text-xs text-zinc-400">
              <p className="font-medium text-zinc-300">Cómo conectar con Meta Ads</p>
              <ol className="list-decimal list-inside space-y-1.5">
                <li>En Meta Ads Manager, abre tu campaña → <strong className="text-zinc-300">Conjunto de anuncios → URL del sitio web</strong></li>
                <li>En <strong className="text-zinc-300">Parámetros de URL</strong>, agrega: <code className="text-indigo-400">utm_campaign=TU_VALOR</code></li>
                <li>El valor debe coincidir exactamente con lo que configuraste arriba</li>
                <li>Cuando alguien haga clic en el anuncio, el script captura ese UTM</li>
                <li>Al llamar <code className="text-indigo-400">SyncLead.capture()</code>, el lead va a la campaña correcta</li>
              </ol>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

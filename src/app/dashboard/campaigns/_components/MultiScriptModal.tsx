"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Check, Code2, Star, Loader2 } from "lucide-react"
import { PlatformSnippetStep } from "./PlatformSnippetStep"
import type { ScriptConfig } from "./PlatformSnippetStep"
import type { CampaignWithClient } from "@/domains/campaigns/repository"
import { ensureOrganicCampaignAction } from "@/domains/campaigns/actions"

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
  const [organicKey, setOrganicKey] = useState<string | null>(null)
  const [loadingOrganic, setLoadingOrganic] = useState(false)
  const [step, setStep] = useState<"select" | "platform">("select")

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

  const utmKeysValid = selectedCampaigns.every((c) => (utmKeys.get(c.id) ?? "").trim() !== "")
  const canGenerate = selected.size > 0 && utmKeysValid && (selected.size === 1 || !!defaultId)

  function buildConfig(): ScriptConfig {
    if (selectedCampaigns.length === 1) {
      const c = selectedCampaigns[0]
      return { mode: "single", apiKey: c.apiKey, campaignName: c.name }
    }
    const defaultCampaign = selectedCampaigns.find((c) => c.id === defaultId)
    return {
      mode: "multi",
      campaigns: selectedCampaigns.map((c) => ({
        utmKey: (utmKeys.get(c.id) ?? "").trim(),
        apiKey: c.apiKey,
        name: c.name,
      })),
      defaultUtmKey: defaultCampaign ? (utmKeys.get(defaultCampaign.id) ?? "").trim() : "",
      organicKey: organicKey ?? undefined,
    }
  }

  async function handleContinue() {
    // Auto-create the "Orgánico / Directo" campaign for the client — never lose a lead
    const clientId = selectedCampaigns[0]?.clientId
    if (clientId) {
      setLoadingOrganic(true)
      try {
        const result = await ensureOrganicCampaignAction(clientId)
        if (result.apiKey) setOrganicKey(result.apiKey)
      } catch { /* non-blocking: snippet still works without organic key */ }
      finally { setLoadingOrganic(false) }
    }
    setStep("platform")
  }

  function handleClose(open: boolean) {
    if (!open) {
      setStep("select")
      setSelected(new Set())
      setUtmKeys(new Map())
      setDefaultId("")
      setOrganicKey(null)
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
          {step === "select" && (
            <DialogDescription>
              Selecciona las campañas e ingresa el valor exacto de{" "}
              <code className="text-indigo-400 bg-indigo-400/10 px-1 rounded">utm_campaign</code>{" "}
              que configuraste en Meta para cada una.
            </DialogDescription>
          )}
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
                        <div
                          onClick={() => toggleCampaign(campaign.id, campaign.name)}
                          className="flex items-center gap-3 p-3 cursor-pointer"
                        >
                          <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected ? "bg-indigo-600 border-indigo-600" : "border-zinc-600"
                          }`}>
                            {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-zinc-100 truncate">{campaign.name}</span>
                              {campaign.client?.name && (
                                <span className="text-xs text-zinc-500 truncate">{campaign.client.name}</span>
                              )}
                            </div>
                          </div>

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

                        {isSelected && (
                          <div className="px-3 pb-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center rounded-md border border-zinc-700 bg-zinc-900 overflow-hidden focus-within:border-indigo-500 transition-colors">
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

                <div className="flex justify-end pt-2 border-t border-zinc-800">
                  <button
                    onClick={handleContinue}
                    disabled={!canGenerate || loadingOrganic}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loadingOrganic && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Continuar → elegir plataforma
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <PlatformSnippetStep
            config={buildConfig()}
            appUrl={appUrl}
            onBack={() => setStep("select")}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

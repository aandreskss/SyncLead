"use client"

import { useState, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Copy, Check, Link2 } from "lucide-react"

// ─── Param definitions ────────────────────────────────────────────────────────

type Group = "synclead" | "utm" | "meta_ids"

interface ParamDef {
  id: string
  label: string
  key: string
  defaultValue: string
  editable: boolean
  defaultEnabled: boolean
  group: Group
  hint?: string
}

const PARAMS: ParamDef[] = [
  // SyncLead group — valores dinámicos de Meta
  {
    id: "adset_name",
    label: "Conjunto de anuncios",
    key: "adset_name",
    defaultValue: "{{adset.name}}",
    editable: false,
    defaultEnabled: true,
    group: "synclead",
    hint: "SyncLead lo muestra en la tabla y el drawer del lead",
  },
  {
    id: "ad_name",
    label: "Anuncio",
    key: "ad_name",
    defaultValue: "{{ad.name}}",
    editable: false,
    defaultEnabled: true,
    group: "synclead",
    hint: "Nombre exacto del anuncio dentro del adset",
  },
  {
    id: "campaign_name",
    label: "Campaña Meta",
    key: "campaign_name",
    defaultValue: "{{campaign.name}}",
    editable: false,
    defaultEnabled: true,
    group: "synclead",
    hint: "Nombre de la campaña en Meta Ads Manager",
  },
  // UTM group
  {
    id: "utm_source",
    label: "utm_source",
    key: "utm_source",
    defaultValue: "facebook",
    editable: true,
    defaultEnabled: true,
    group: "utm",
    hint: "Origen del tráfico (facebook, instagram, meta…)",
  },
  {
    id: "utm_medium",
    label: "utm_medium",
    key: "utm_medium",
    defaultValue: "paid",
    editable: true,
    defaultEnabled: true,
    group: "utm",
    hint: "Tipo de medio (paid, cpc, social…)",
  },
  {
    id: "utm_campaign",
    label: "utm_campaign",
    key: "utm_campaign",
    defaultValue: "{{campaign.name}}",
    editable: true,
    defaultEnabled: true,
    group: "utm",
    hint: "Usa {{campaign.name}} para el nombre dinámico, o escribe el valor fijo que configuraste en SyncLead",
  },
  {
    id: "utm_content",
    label: "utm_content",
    key: "utm_content",
    defaultValue: "{{ad.name}}",
    editable: true,
    defaultEnabled: false,
    group: "utm",
    hint: "Diferencia variantes del mismo anuncio",
  },
  // Meta IDs — avanzado
  {
    id: "campaign_id",
    label: "campaign_id",
    key: "campaign_id",
    defaultValue: "{{campaign.id}}",
    editable: false,
    defaultEnabled: false,
    group: "meta_ids",
    hint: "ID numérico de la campaña en Meta",
  },
  {
    id: "adset_id",
    label: "adset_id",
    key: "adset_id",
    defaultValue: "{{adset.id}}",
    editable: false,
    defaultEnabled: false,
    group: "meta_ids",
    hint: "ID numérico del conjunto de anuncios",
  },
  {
    id: "ad_id",
    label: "ad_id",
    key: "ad_id",
    defaultValue: "{{ad.id}}",
    editable: false,
    defaultEnabled: false,
    group: "meta_ids",
    hint: "ID numérico del anuncio",
  },
  {
    id: "placement",
    label: "placement",
    key: "placement",
    defaultValue: "{{placement}}",
    editable: false,
    defaultEnabled: false,
    group: "meta_ids",
    hint: "Ubicación del anuncio (feed, stories, reels…)",
  },
]

const GROUP_LABELS: Record<Group, string> = {
  synclead: "Tracking SyncLead",
  utm: "Parámetros UTM",
  meta_ids: "IDs de Meta (avanzado)",
}

const GROUPS: Group[] = ["synclead", "utm", "meta_ids"]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UrlParamBuilderModal({ open, onOpenChange }: Props) {
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(PARAMS.filter((p) => p.defaultEnabled).map((p) => p.id))
  )
  const [values, setValues] = useState<Map<string, string>>(
    () => new Map(PARAMS.map((p) => [p.id, p.defaultValue]))
  )
  const [baseUrl, setBaseUrl] = useState("")
  const [copiedParams, setCopiedParams] = useState(false)
  const [copiedFull, setCopiedFull] = useState(false)

  function toggleParam(id: string) {
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setValue(id: string, value: string) {
    setValues((m) => { const n = new Map(m); n.set(id, value); return n })
  }

  const paramString = useMemo(() => {
    return PARAMS
      .filter((p) => enabled.has(p.id))
      .map((p) => `${p.key}=${values.get(p.id) ?? p.defaultValue}`)
      .join("&")
  }, [enabled, values])

  const fullUrl = useMemo(() => {
    if (!baseUrl.trim() || !paramString) return ""
    const sep = baseUrl.includes("?") ? "&" : "?"
    return `${baseUrl.trim()}${sep}${paramString}`
  }, [baseUrl, paramString])

  async function copyParams() {
    await navigator.clipboard.writeText(paramString)
    setCopiedParams(true)
    setTimeout(() => setCopiedParams(false), 2000)
  }

  async function copyFull() {
    if (!fullUrl) return
    await navigator.clipboard.writeText(fullUrl)
    setCopiedFull(true)
    setTimeout(() => setCopiedFull(false), 2000)
  }

  function handleClose(open: boolean) {
    if (!open) {
      setEnabled(new Set(PARAMS.filter((p) => p.defaultEnabled).map((p) => p.id)))
      setValues(new Map(PARAMS.map((p) => [p.id, p.defaultValue])))
      setBaseUrl("")
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-ops-blue-t" />
            Generador de parámetros de URL
          </DialogTitle>
          <DialogDescription>
            Selecciona los parámetros que quieres trackear. Pega el resultado en el campo{" "}
            <strong className="text-ops-tx">URL parameters</strong> de cada anuncio en Meta Ads Manager.
            Meta reemplaza los valores <code className="text-ops-blue-t bg-ops-blue/10 px-1 rounded">{"{{...}}"}</code> dinámicamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Parameter groups */}
          {GROUPS.map((group) => {
            const groupParams = PARAMS.filter((p) => p.group === group)
            return (
              <div key={group} className="space-y-2">
                <p className="text-xs font-semibold text-ops-tx2 uppercase tracking-wider">
                  {GROUP_LABELS[group]}
                </p>
                <div className="space-y-1.5">
                  {groupParams.map((param) => {
                    const isEnabled = enabled.has(param.id)
                    const val = values.get(param.id) ?? param.defaultValue
                    return (
                      <div
                        key={param.id}
                        className={`rounded-lg border transition-colors ${
                          isEnabled ? "border-ops-blue/40 bg-ops-blue/5" : "border-ops-line bg-ops-s1"
                        }`}
                      >
                        <div
                          onClick={() => toggleParam(param.id)}
                          className="flex items-center gap-3 px-3 py-2 cursor-pointer"
                        >
                          {/* Checkbox */}
                          <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                            isEnabled ? "bg-ops-blue border-ops-blue" : "border-ops-bd2"
                          }`}>
                            {isEnabled && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>

                          {/* Label */}
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-mono text-ops-tx">{param.key}</span>
                            {param.hint && (
                              <span className="text-xs text-ops-tx3 ml-2">{param.hint}</span>
                            )}
                          </div>

                          {/* Value preview (non-editable) */}
                          {!param.editable && (
                            <span className="text-xs font-mono text-ops-blue-t flex-shrink-0">
                              {val}
                            </span>
                          )}
                        </div>

                        {/* Editable value input */}
                        {isEnabled && param.editable && (
                          <div className="px-3 pb-2.5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center rounded-md border border-ops-bd bg-ops-s1 overflow-hidden focus-within:border-ops-blue transition-colors">
                              <span className="px-2.5 py-1.5 text-xs text-ops-tx3 bg-ops-s2 border-r border-ops-bd font-mono select-none whitespace-nowrap">
                                {param.key}=
                              </span>
                              <input
                                type="text"
                                value={val}
                                onChange={(e) => setValue(param.id, e.target.value)}
                                className="flex-1 px-2.5 py-1.5 text-xs font-mono text-ops-tx bg-transparent focus:outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Base URL (optional) */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ops-tx2 uppercase tracking-wider">URL de destino (opcional)</p>
            <div className="flex items-center rounded-lg border border-ops-bd bg-ops-s1 overflow-hidden focus-within:border-ops-blue transition-colors">
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://mi-tienda.com/producto"
                className="flex-1 px-3 py-2 text-xs font-mono text-ops-tx bg-transparent focus:outline-none placeholder-ops-tx3"
              />
            </div>
            <p className="text-xs text-ops-tx3">Si la completas, se genera la URL final con todos los parámetros incluidos.</p>
          </div>

          {/* Output */}
          {paramString && (
            <div className="space-y-3 border-t border-ops-line pt-4">
              {/* Params string */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ops-tx3">Parámetros de URL — pegar en Meta Ads Manager</span>
                  <button
                    onClick={copyParams}
                    className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-ops-s2 text-ops-tx2 hover:text-ops-tx hover:bg-ops-sel transition-colors"
                  >
                    {copiedParams ? <Check className="h-3 w-3 text-ops-green" /> : <Copy className="h-3 w-3" />}
                    {copiedParams ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <div className="rounded-lg border border-ops-bd bg-ops-bg p-3">
                  <pre className="text-xs text-ops-blue-t font-mono whitespace-pre-wrap break-all leading-relaxed">
                    {paramString}
                  </pre>
                </div>
              </div>

              {/* Full URL */}
              {fullUrl && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ops-tx3">URL completa</span>
                    <button
                      onClick={copyFull}
                      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-ops-s2 text-ops-tx2 hover:text-ops-tx hover:bg-ops-sel transition-colors"
                    >
                      {copiedFull ? <Check className="h-3 w-3 text-ops-green" /> : <Copy className="h-3 w-3" />}
                      {copiedFull ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                  <div className="rounded-lg border border-ops-bd bg-ops-bg p-3">
                    <pre className="text-xs text-ops-tx2 font-mono whitespace-pre-wrap break-all leading-relaxed">
                      {fullUrl}
                    </pre>
                  </div>
                </div>
              )}

              {/* Meta hint */}
              <p className="text-xs text-ops-tx3 bg-ops-s1 rounded-lg px-3 py-2 border border-ops-line">
                En Meta Ads Manager: abre el anuncio → <strong className="text-ops-tx3">URL de destino</strong> → <strong className="text-ops-tx3">Parámetros de URL</strong> → pega el string de arriba. Meta reemplaza los valores <code className="text-ops-blue-t">{"{{...}}"}</code> automáticamente al servir el anuncio.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useState, useTransition } from "react"
import type {
  TrackingSitePublic,
  ConversionWithStatus,
  ConversionIssuePublic,
} from "@/domains/tracking/types"
import type { MetaConnectionPublic } from "@/domains/meta/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConversionList } from "./ConversionList"
import { Plus, Layout, AlertCircle, CheckCircle2, CircleDot, X, XCircle, ExternalLink } from "lucide-react"
import { createTrackingSiteAction, applyBusinessTemplateAction } from "@/domains/tracking/actions"

type Props = {
  clientId: string
  sites: TrackingSitePublic[]
  definitions: ConversionWithStatus[]
  issues: ConversionIssuePublic[]
  metaConnections: MetaConnectionPublic[]
}


function HealthSummary({
  sites,
  definitions,
  issues,
  metaConnections,
}: {
  sites: TrackingSitePublic[]
  definitions: ConversionWithStatus[]
  issues: ConversionIssuePublic[]
  metaConnections: MetaConnectionPublic[]
}) {
  // Pixel: observed = pixel fired and detected; configured = pixel_id set but no observations yet
  const hasPixelDetected = definitions.some(
    (d) =>
      d.diagStatus === "observed_browser" ||
      d.diagStatus === "observed_both" ||
      d.diagStatus === "accepted_by_meta"
  )
  const hasPixelConfigured =
    sites.some((s) => s.expectedPixelId) ||
    metaConnections.some((c) => c.status === "active" && c.pixelId)

  // CAPI connection: derived from meta_connections (source of truth) + live observations
  const activeConn = metaConnections.find((c) => c.status === "active")
  const errorConn = !activeConn && metaConnections.find((c) => c.status === "error")
  const hasCapiObserved = definitions.some(
    (d) =>
      d.diagStatus === "observed_server" ||
      d.diagStatus === "observed_both" ||
      d.diagStatus === "accepted_by_meta"
  )

  const criticalCount = issues.filter(
    (i) => i.severity === "critical" && i.status === "open"
  ).length

  const pixelStatus = hasPixelDetected
    ? "detectado"
    : hasPixelConfigured
    ? "configurado"
    : "sin_pixel"

  // CAPI status: active connection > error connection > no connection
  const capiStatus = activeConn
    ? hasCapiObserved ? "activo_con_señal" : "conectado"
    : errorConn
    ? "error"
    : "sin_conexion"

  return (
    <div className="space-y-3">
      {/* Conexión Meta — fuente de verdad */}
      {metaConnections.length > 0 && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
          <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wide">Conexión Meta configurada</p>
          <div className="flex flex-wrap gap-3">
            {metaConnections.map((conn) => (
              <div key={conn.id} className="flex items-center gap-2">
                {conn.status === "active" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                ) : conn.status === "error" ? (
                  <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                ) : (
                  <CircleDot className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                )}
                <span className="text-sm text-zinc-200">
                  {conn.pixelId ? (
                    <>
                      Pixel <span className="font-mono text-zinc-400">{conn.pixelId}</span>
                    </>
                  ) : (
                    "Sin Pixel ID"
                  )}
                </span>
                <Badge
                  className={
                    conn.status === "active"
                      ? "bg-green-900 text-green-300 border-green-800 text-xs"
                      : conn.status === "error"
                      ? "bg-red-900 text-red-300 border-red-800 text-xs"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700 text-xs"
                  }
                >
                  {conn.status === "active" ? "Activo" : conn.status === "error" ? "Error" : conn.status}
                </Badge>
                {conn.lastError && (
                  <span className="text-xs text-red-400 truncate max-w-[200px]">{conn.lastError}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Métricas de diagnóstico */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-xs text-zinc-500 mb-1">Pixel base</p>
          <div className="flex items-center gap-2">
            {pixelStatus === "detectado" ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : pixelStatus === "configurado" ? (
              <CircleDot className="h-4 w-4 text-amber-500" />
            ) : (
              <CircleDot className="h-4 w-4 text-zinc-500" />
            )}
            <span className="text-sm font-medium text-zinc-200">
              {pixelStatus === "detectado"
                ? "Detectado"
                : pixelStatus === "configurado"
                ? "Configurado"
                : "Sin Pixel ID"}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-xs text-zinc-500 mb-1">CAPI</p>
          <div className="flex items-center gap-2">
            {capiStatus === "activo_con_señal" || capiStatus === "conectado" ? (
              <CheckCircle2 className={`h-4 w-4 ${capiStatus === "activo_con_señal" ? "text-green-500" : "text-emerald-600"}`} />
            ) : capiStatus === "error" ? (
              <XCircle className="h-4 w-4 text-red-400" />
            ) : (
              <CircleDot className="h-4 w-4 text-zinc-500" />
            )}
            <span className="text-sm font-medium text-zinc-200">
              {capiStatus === "activo_con_señal"
                ? "Enviando"
                : capiStatus === "conectado"
                ? "Conectado"
                : capiStatus === "error"
                ? "Error"
                : "Sin conexión"}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-xs text-zinc-500 mb-1">Eventos configurados</p>
          <span className="text-2xl font-bold text-zinc-100">{definitions.length}</span>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <p className="text-xs text-zinc-500 mb-1">Problemas críticos</p>
          <span
            className={`text-2xl font-bold ${criticalCount > 0 ? "text-red-400" : "text-zinc-100"}`}
          >
            {criticalCount}
          </span>
        </div>
      </div>

      {/* Aviso si no hay conexión Meta */}
      {metaConnections.length === 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-800/50 bg-amber-900/10 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-300">
            Este cliente no tiene una conexión Meta (Pixel + token CAPI) configurada.{" "}
            <a
              href="../?tab=configuracion"
              className="underline hover:text-amber-200 inline-flex items-center gap-1"
            >
              Ir a Configuración <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>
      )}
    </div>
  )
}

function SiteSelector({
  sites,
  selectedId,
  onSelect,
}: {
  sites: TrackingSitePublic[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (sites.length <= 1) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-zinc-400">Sitio:</span>
      <select
        value={selectedId ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-500"
      >
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.domain})
          </option>
        ))}
      </select>
    </div>
  )
}

function EmptySites() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900 px-6 py-12 text-center">
      <p className="text-zinc-400 mb-2">No hay sitios de tracking configurados</p>
      <p className="text-sm text-zinc-500 mb-4">
        Agrega tu primer sitio para comenzar el diagnóstico de conversiones.
      </p>
    </div>
  )
}

function IssuesList({ issues }: { issues: ConversionIssuePublic[] }) {
  if (issues.length === 0) return null

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <AlertCircle className="h-4 w-4 text-red-400" />
        <h3 className="text-sm font-medium text-zinc-200">Problemas abiertos</h3>
        <Badge className="ml-auto bg-red-700 text-white border-red-600 text-xs">
          {issues.length}
        </Badge>
      </div>
      <ul className="divide-y divide-zinc-800">
        {issues.map((issue) => (
          <li key={issue.id} className="flex items-start gap-3 px-4 py-3">
            <span
              className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                issue.severity === "critical"
                  ? "bg-red-500"
                  : issue.severity === "high"
                  ? "bg-orange-500"
                  : "bg-yellow-500"
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-300">{issue.issueCode}</p>
              {issue.explanation && (
                <p className="text-xs text-zinc-500 mt-0.5">{issue.explanation}</p>
              )}
            </div>
            <Badge
              className={
                issue.severity === "critical"
                  ? "bg-red-900 text-red-300 border-red-800 text-xs"
                  : issue.severity === "high"
                  ? "bg-orange-900 text-orange-300 border-orange-800 text-xs"
                  : "bg-yellow-900 text-yellow-300 border-yellow-800 text-xs"
              }
            >
              {issue.severity}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AddSiteModal({
  clientId,
  onClose,
  onCreated,
}: {
  clientId: string
  onClose: () => void
  onCreated: (site: TrackingSitePublic) => void
}) {
  const [name, setName] = useState("")
  const [domain, setDomain] = useState("")
  const [pixelId, setPixelId] = useState("")
  const [environment, setEnvironment] = useState<"production" | "staging" | "development">("production")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createTrackingSiteAction({
        clientId,
        name,
        domain,
        environment,
        expectedPixelId: pixelId.trim() || undefined,
      })
      if (result.error) return setError(result.error)
      if (result.data) {
        onCreated(result.data)
        onClose()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-100">Agregar sitio</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">Nombre del sitio</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mi sitio web"
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">URL del dominio</label>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="https://ejemplo.com"
              type="url"
              required
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">
              Pixel ID de Meta{" "}
              <span className="text-zinc-600">(opcional)</span>
            </label>
            <input
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
              placeholder="123456789012345"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">Entorno</label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as typeof environment)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="production">Producción</option>
              <option value="staging">Staging</option>
              <option value="development">Desarrollo</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="text-sm text-zinc-400 hover:text-zinc-200">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {isPending ? "Creando..." : "Crear sitio"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ApplyTemplateModal({
  clientId,
  sites,
  onClose,
  onApplied,
}: {
  clientId: string
  sites: TrackingSitePublic[]
  onClose: () => void
  onApplied: () => void
}) {
  const [template, setTemplate] = useState<"lead_gen" | "ecommerce" | "bookings">("lead_gen")
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "")
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleApply(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await applyBusinessTemplateAction({
        clientId,
        trackingSiteId: siteId || undefined,
        template,
      })
      if (res.error) return setError(res.error)
      setResult({ created: res.created ?? 0, skipped: res.skipped ?? 0 })
    })
  }

  const TEMPLATES = [
    { value: "lead_gen", label: "Generación de leads", desc: "PageView, Lead, Contact" },
    { value: "ecommerce", label: "E-commerce", desc: "ViewContent, AddToCart, Purchase" },
    { value: "bookings", label: "Reservas / Citas", desc: "PageView, Lead, Schedule" },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-100">Aplicar plantilla de eventos</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        {result ? (
          <div className="p-5 text-center space-y-3">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto" />
            <p className="text-sm text-zinc-200">
              {result.created} evento{result.created !== 1 ? "s" : ""} creado{result.created !== 1 ? "s" : ""}
              {result.skipped > 0 && `, ${result.skipped} ya existía${result.skipped !== 1 ? "n" : ""}`}
            </p>
            <button
              onClick={onApplied}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Listo
            </button>
          </div>
        ) : (
          <form onSubmit={handleApply} className="space-y-4 p-5">
            {sites.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Sitio</label>
                <select
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Sin sitio específico</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Plantilla</label>
              {TEMPLATES.map((t) => (
                <label
                  key={t.value}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    template === t.value
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="template"
                    value={t.value}
                    checked={template === t.value}
                    onChange={() => setTemplate(t.value as typeof template)}
                    className="accent-indigo-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{t.label}</p>
                    <p className="text-xs text-zinc-500">{t.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={onClose} className="text-sm text-zinc-400 hover:text-zinc-200">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {isPending ? "Aplicando..." : "Aplicar plantilla"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export function TrackingDashboard({ clientId, sites: initialSites, definitions, issues, metaConnections }: Props) {
  const [sites, setSites] = useState<TrackingSitePublic[]>(initialSites)
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(
    initialSites[0]?.id ?? null
  )
  const [showAddSite, setShowAddSite] = useState(false)
  const [showTemplate, setShowTemplate] = useState(false)

  const filteredDefinitions =
    selectedSiteId && sites.length > 1
      ? definitions.filter(
          (d) => d.trackingSiteId === selectedSiteId || d.trackingSiteId === null
        )
      : definitions

  function handleSiteCreated(site: TrackingSitePublic) {
    setSites((prev) => [...prev, site])
    setSelectedSiteId(site.id)
  }

  return (
    <div className="space-y-6">
      {showAddSite && (
        <AddSiteModal
          clientId={clientId}
          onClose={() => setShowAddSite(false)}
          onCreated={handleSiteCreated}
        />
      )}
      {showTemplate && (
        <ApplyTemplateModal
          clientId={clientId}
          sites={sites}
          onClose={() => setShowTemplate(false)}
          onApplied={() => {
            setShowTemplate(false)
            window.location.reload()
          }}
        />
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Diagnóstico de conversiones</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Verifica y prueba el estado de tus conversiones de Meta Pixel y CAPI
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            onClick={() => setShowTemplate(true)}
          >
            <Layout className="h-4 w-4 mr-1.5" />
            Aplicar plantilla
          </Button>
          <Button
            size="sm"
            className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
            onClick={() => setShowAddSite(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Agregar sitio
          </Button>
        </div>
      </div>

      <HealthSummary sites={sites} definitions={filteredDefinitions} issues={issues} metaConnections={metaConnections} />

      {sites.length === 0 ? (
        <EmptySites />
      ) : (
        <SiteSelector
          sites={sites}
          selectedId={selectedSiteId}
          onSelect={setSelectedSiteId}
        />
      )}

      {filteredDefinitions.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-medium text-zinc-200">Conversiones configuradas</h2>
          </div>
          <ConversionList definitions={filteredDefinitions} clientId={clientId} />
        </div>
      )}

      {issues.length > 0 && <IssuesList issues={issues} />}
    </div>
  )
}

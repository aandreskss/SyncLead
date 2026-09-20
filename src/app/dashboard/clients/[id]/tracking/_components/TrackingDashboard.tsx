"use client"

import { useState } from "react"
import type {
  TrackingSitePublic,
  ConversionWithStatus,
  ConversionIssuePublic,
} from "@/domains/tracking/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConversionList } from "./ConversionList"
import { Plus, Layout, AlertCircle, CheckCircle2, CircleDot } from "lucide-react"

type Props = {
  clientId: string
  sites: TrackingSitePublic[]
  definitions: ConversionWithStatus[]
  issues: ConversionIssuePublic[]
}


function HealthSummary({
  sites,
  definitions,
  issues,
}: {
  sites: TrackingSitePublic[]
  definitions: ConversionWithStatus[]
  issues: ConversionIssuePublic[]
}) {
  const hasPixelDetected = definitions.some(
    (d) =>
      d.diagStatus === "code_detected" ||
      d.diagStatus === "observed_browser" ||
      d.diagStatus === "observed_both" ||
      d.diagStatus === "accepted_by_meta"
  )
  const hasCapi = definitions.some(
    (d) =>
      d.diagStatus === "observed_server" ||
      d.diagStatus === "observed_both" ||
      d.diagStatus === "accepted_by_meta"
  )
  const criticalCount = issues.filter(
    (i) => i.severity === "critical" && i.status === "open"
  ).length

  const pixelStatus = sites.length === 0
    ? "no_escaneado"
    : hasPixelDetected
    ? "detectado"
    : "no_detectado"

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <p className="text-xs text-zinc-500 mb-1">Pixel base</p>
        <div className="flex items-center gap-2">
          {pixelStatus === "detectado" ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <CircleDot className="h-4 w-4 text-zinc-500" />
          )}
          <span className="text-sm font-medium text-zinc-200">
            {pixelStatus === "detectado"
              ? "Detectado"
              : pixelStatus === "no_detectado"
              ? "No detectado"
              : "Sin escanear"}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <p className="text-xs text-zinc-500 mb-1">CAPI</p>
        <div className="flex items-center gap-2">
          {hasCapi ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <CircleDot className="h-4 w-4 text-zinc-500" />
          )}
          <span className="text-sm font-medium text-zinc-200">
            {hasCapi ? "Activo" : "Inactivo"}
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

export function TrackingDashboard({ clientId, sites, definitions, issues }: Props) {
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(
    sites[0]?.id ?? null
  )

  const filteredDefinitions =
    selectedSiteId && sites.length > 1
      ? definitions.filter(
          (d) => d.trackingSiteId === selectedSiteId || d.trackingSiteId === null
        )
      : definitions

  return (
    <div className="space-y-6">
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
          >
            <Layout className="h-4 w-4 mr-1.5" />
            Aplicar plantilla
          </Button>
          <Button
            size="sm"
            className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Agregar sitio
          </Button>
        </div>
      </div>

      {sites.length === 0 ? (
        <EmptySites />
      ) : (
        <>
          <SiteSelector
            sites={sites}
            selectedId={selectedSiteId}
            onSelect={setSelectedSiteId}
          />
          <HealthSummary sites={sites} definitions={filteredDefinitions} issues={issues} />
        </>
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

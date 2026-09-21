"use client"

import { useState, useTransition } from "react"
import type { ConversionWithStatus, ConversionDefinitionPublic, DiagConversionStatus } from "@/domains/tracking/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TestWizard } from "./TestWizard"
import { InstallationDrawer } from "./InstallationDrawer"
import { simulateObservationAction } from "@/domains/tracking/actions"
import { Beaker, BookOpen, Clock, History, Zap, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"

type Props = {
  definitions: ConversionWithStatus[]
  clientId: string
}

const STATUS_CONFIG: Record<DiagConversionStatus, { label: string; className: string }> = {
  not_configured: {
    label: "Sin configurar",
    className: "bg-ops-s2 text-ops-tx2 border-ops-bd",
  },
  unknown: {
    label: "Desconocido",
    className: "bg-ops-s2 text-ops-tx2 border-ops-bd",
  },
  code_not_detected: {
    label: "Código no detectado",
    className: "bg-red-900 text-ops-coral border-red-800",
  },
  code_detected: {
    label: "Código detectado",
    className: "bg-yellow-900 text-yellow-300 border-yellow-800",
  },
  awaiting_test: {
    label: "Esperando evento",
    className: "bg-blue-900 text-blue-300 border-blue-800 animate-pulse",
  },
  observed_browser: {
    label: "Pixel activo",
    className: "bg-green-900 text-green-300 border-green-800",
  },
  observed_server: {
    label: "CAPI activo",
    className: "bg-green-900 text-green-300 border-green-800",
  },
  observed_both: {
    label: "Pixel + CAPI",
    className: "bg-emerald-900 text-ops-green border-emerald-800",
  },
  accepted_by_meta: {
    label: "Aceptado por Meta",
    className: "bg-emerald-900 text-ops-green border-emerald-800",
  },
  misconfigured: {
    label: "Mal configurado",
    className: "bg-red-900 text-ops-coral border-red-800",
  },
  duplicate_risk: {
    label: "Riesgo de duplicado",
    className: "bg-red-900 text-ops-coral border-red-800",
  },
  failed: {
    label: "Error",
    className: "bg-red-900 text-ops-coral border-red-800",
  },
  stale: {
    label: "Sin actividad reciente",
    className: "bg-yellow-900 text-yellow-300 border-yellow-800",
  },
}

function formatRelativeDate(date: Date | null): string {
  if (!date) return "Nunca"
  const d = date instanceof Date ? date : new Date(date)
  const diffMs = Date.now() - d.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays === 0) return "Hoy"
  if (diffDays === 1) return "Ayer"
  if (diffDays < 30) return `Hace ${diffDays} días`
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
}

function SourceBadge({ source }: { source: "browser" | "server" | "both" }) {
  const labels = {
    browser: "Pixel",
    server: "CAPI",
    both: "Pixel + CAPI",
  }
  return (
    <span className="text-xs text-ops-tx3">{labels[source]}</span>
  )
}

type SimulateState = { status: "ok"; eventName: string } | { status: "err"; message: string }

function SimulateButton({ def, clientId }: { def: ConversionDefinitionPublic; clientId: string }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<SimulateState | null>(null)

  function handleSimulate() {
    setResult(null)
    startTransition(async () => {
      const r = await simulateObservationAction({ clientId, conversionDefinitionId: def.id })
      if (r.error) {
        setResult({ status: "err", message: r.error })
      } else {
        setResult({ status: "ok", eventName: def.providerEventName })
        // Clear success message after 4s
        setTimeout(() => setResult(null), 4000)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleSimulate}
        disabled={isPending}
        title="Simula el evento directamente desde el servidor, sin necesidad de instalar código"
        className="border-ops-bd bg-ops-s2 text-ops-tx2 hover:bg-ops-sel hover:text-ops-tx text-xs"
      >
        {isPending
          ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          : <Zap className="h-3.5 w-3.5 mr-1.5" />
        }
        Simular
      </Button>
      {result && (
        <span className={`flex items-center gap-1 text-xs ${result.status === "ok" ? "text-ops-green" : "text-ops-coral"}`}>
          {result.status === "ok"
            ? <><CheckCircle2 className="h-3 w-3" /> {result.eventName} registrado</>
            : <><AlertCircle className="h-3 w-3" /> {result.message}</>
          }
        </span>
      )}
    </div>
  )
}

export function ConversionList({ definitions, clientId }: Props) {
  const [testWizardDef, setTestWizardDef] = useState<ConversionDefinitionPublic | null>(null)
  const [installDrawerDef, setInstallDrawerDef] = useState<ConversionDefinitionPublic | null>(null)

  if (definitions.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-ops-tx3">
        No hay conversiones configuradas para este sitio.
      </div>
    )
  }

  return (
    <>
      <ul className="divide-y divide-ops-line">
        {definitions.map((def) => {
          const statusCfg = STATUS_CONFIG[def.diagStatus] ?? STATUS_CONFIG.unknown

          return (
            <li key={def.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ops-tx truncate">{def.displayName}</span>
                  <Badge className={`text-xs ${statusCfg.className}`}>
                    {statusCfg.label}
                  </Badge>
                  {def.criticality === "critical" && (
                    <Badge className="text-xs bg-red-950 text-ops-coral border-red-900">Crítico</Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-ops-tx3">
                  <span>Meta: <span className="text-ops-tx2">{def.providerEventName}</span></span>
                  <SourceBadge source={def.expectedSource} />
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRelativeDate(def.lastObservedAt)}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <SimulateButton def={def} clientId={clientId} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTestWizardDef(def)}
                  className="border-ops-bd bg-ops-s2 text-ops-tx2 hover:bg-ops-sel hover:text-ops-tx text-xs"
                >
                  <Beaker className="h-3.5 w-3.5 mr-1.5" />
                  Probar en vivo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInstallDrawerDef(def)}
                  className="border-ops-bd bg-ops-s2 text-ops-tx2 hover:bg-ops-sel hover:text-ops-tx text-xs"
                >
                  <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                  Cómo instalar
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {testWizardDef && (
        <TestWizard
          definition={testWizardDef}
          clientId={clientId}
          siteId={testWizardDef.trackingSiteId}
          onClose={() => setTestWizardDef(null)}
        />
      )}

      {installDrawerDef && (
        <InstallationDrawer
          definition={installDrawerDef}
          onClose={() => setInstallDrawerDef(null)}
        />
      )}
    </>
  )
}

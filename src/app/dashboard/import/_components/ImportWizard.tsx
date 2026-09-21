"use client"

import { useState, useTransition } from "react"
import { Check, UploadCloud } from "lucide-react"
import { cn } from "@/lib/utils"
import { Panel, opsField } from "@/components/app/ops"
import {
  uploadImportFileAction,
  saveColumnMappingAction,
  runDryRunAction,
  confirmImportAction,
  downloadReportAction,
} from "@/domains/import/actions"
import type { ColumnMapping, DryRunResult, ImportRowResult } from "@/domains/import/types"
import { TARGET_FIELD_LABELS } from "@/domains/import/types"
import { ColumnMapper } from "./ColumnMapper"
import { DryRunPreview } from "./DryRunPreview"
import { ImportProgress } from "./ImportProgress"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  campaigns: Array<{ id: string; name: string; clientName: string }>
}

type Step = "select" | "upload" | "mapping" | "dryrun" | "confirm" | "done"

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS: { label: string }[] = [
  { label: "Campaña destino" },
  { label: "Sube tu archivo" },
  { label: "Mapeo de columnas" },
  { label: "Revisión e importación" },
]

const STEP_INDEX: Record<Step, number> = { select: 0, upload: 1, mapping: 2, dryrun: 3, confirm: 3, done: 4 }

function StepBar({ current }: { current: Step }) {
  const idx = STEP_INDEX[current]
  return (
    <ol className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Pasos de importación">
      {STEPS.map((s, i) => {
        const done = i < idx
        const active = i === idx
        return (
          <li
            key={s.label}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border px-3 py-2.5",
              active ? "border-ops-blue/50 bg-ops-s1" : "border-ops-line bg-ops-s1"
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-plex text-xs font-semibold tabular-nums",
                done ? "bg-ops-green text-ops-bg" : active ? "bg-ops-blue text-white" : "bg-ops-s2 text-ops-tx3"
              )}
            >
              {done ? <Check aria-hidden className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn("text-[13px] font-medium", active ? "text-ops-tx" : done ? "text-ops-tx2" : "text-ops-tx3")}>
              {s.label}
              <span className="sr-only">{done ? " (completado)" : active ? " (paso actual)" : " (pendiente)"}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

const btnPrimary =
  "inline-flex h-9 items-center justify-center rounded-md bg-ops-blue px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue disabled:cursor-not-allowed disabled:opacity-50"
const btnSecondary =
  "inline-flex h-9 items-center justify-center rounded-md border border-ops-bd px-4 text-[13px] font-medium text-ops-tx2 transition-colors hover:border-ops-bd2 hover:bg-ops-hover hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-ops-blue"
const footerBar = "flex items-center justify-between gap-3 border-t border-ops-line bg-ops-side px-4 py-3"

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function ImportWizard({ campaigns }: Props) {
  const [step, setStep] = useState<Step>("select")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Wizard state
  const [campaignId, setCampaignId] = useState("")
  const [batchId, setBatchId] = useState("")
  const [columns, setColumns] = useState<string[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null)
  const [importResults, setImportResults] = useState<ImportRowResult[] | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  function handleError(msg: string) {
    setError(msg)
  }

  // ── Step 1: Select campaign ───────────────────────────────────────────────

  function handleSelectCampaign() {
    if (!campaignId) return setError("Selecciona una campaña")
    setError(null)
    setStep("upload")
  }

  // ── Step 2: Upload file ───────────────────────────────────────────────────

  function handleFileUpload() {
    if (!selectedFile) return setError("Selecciona un archivo")
    setError(null)

    startTransition(async () => {
      const formData = new FormData()
      formData.append("file", selectedFile)
      formData.append("campaignId", campaignId)

      const result = await uploadImportFileAction(formData)
      if ("error" in result) return handleError(result.error)

      setBatchId(result.batchId)
      setColumns(result.columns)
      setMapping(result.suggestedMapping)
      setStep("mapping")
    })
  }

  // ── Step 3: Save mapping ──────────────────────────────────────────────────

  function handleSaveMapping() {
    if (!Object.values(mapping).some((v) => v !== "__skip")) {
      return setError("Mapea al menos una columna")
    }
    setError(null)

    startTransition(async () => {
      const saved = await saveColumnMappingAction(batchId, mapping)
      if ("error" in saved) return handleError(saved.error)

      const dryRun = await runDryRunAction(batchId)
      if ("error" in dryRun) return handleError(dryRun.error)

      setDryRunResult(dryRun)
      setStep("dryrun")
    })
  }

  // ── Step 4: Confirm import ────────────────────────────────────────────────

  function handleConfirmImport() {
    setError(null)
    setStep("confirm")

    startTransition(async () => {
      const result = await confirmImportAction(batchId)
      if ("error" in result) {
        setError(result.error)
        setStep("dryrun")
        return
      }
      setImportResults(result.results)
      setStep("done")
    })
  }

  // ── Step 6: Download report ───────────────────────────────────────────────

  function handleDownloadReport() {
    startTransition(async () => {
      const result = await downloadReportAction(batchId)
      if ("error" in result) return handleError(result.error)

      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = result.filename
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div className="space-y-5">
      <StepBar current={step} />

      {error && (
        <div role="alert" className="rounded-lg border border-ops-coral/40 bg-ops-coral/10 px-4 py-3 text-sm text-ops-coral">
          {error}
        </div>
      )}

      {/* ── Step 1: Select campaign ─────────────────────────────────────────── */}
      {step === "select" && (
        <Panel>
          <div className="space-y-4 p-5">
            <div>
              <h2 className="text-sm font-semibold text-ops-tx">Selecciona la campaña de destino</h2>
              <p className="mt-0.5 text-sm text-ops-tx2">Los leads importados se asignarán a esta campaña.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="import-campaign" className="text-xs font-medium text-ops-tx2">Campaña</label>
              <select
                id="import-campaign"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className={cn(opsField, "w-full")}
              >
                <option value="">— Seleccionar campaña —</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.clientName} · {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={footerBar}>
            <span />
            <button onClick={handleSelectCampaign} className={btnPrimary}>
              Continuar
            </button>
          </div>
        </Panel>
      )}

      {/* ── Step 2: Upload file ─────────────────────────────────────────────── */}
      {step === "upload" && (
        <Panel>
          <div className="space-y-4 p-5">
            <div>
              <h2 className="text-sm font-semibold text-ops-tx">Sube tu archivo</h2>
              <p className="mt-0.5 text-sm text-ops-tx2">
                Formatos aceptados: CSV, XLSX, XLS. Tamaño máximo: 5 MB. Se usa la primera hoja del archivo XLSX.
              </p>
            </div>

            <div
              role="button"
              tabIndex={0}
              aria-label="Arrastra un archivo aquí o haz clic para seleccionar"
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-ops-bd2 px-6 py-10 text-center transition-colors hover:border-ops-blue/60 hover:bg-ops-hover focus-visible:outline-2 focus-visible:outline-ops-blue"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files[0]
                if (f) setSelectedFile(f)
              }}
              onClick={() => document.getElementById("file-input")?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  document.getElementById("file-input")?.click()
                }
              }}
            >
              <input
                id="file-input"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                tabIndex={-1}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setSelectedFile(f)
                }}
              />
              <UploadCloud aria-hidden className="h-6 w-6 text-ops-tx2" />
              {selectedFile ? (
                <div className="text-sm">
                  <p className="font-medium text-ops-tx">{selectedFile.name}</p>
                  <p className="mt-1 font-plex tabular-nums text-ops-tx3">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="text-sm text-ops-tx2">
                  <p>Arrastra un archivo aquí o haz clic para seleccionar</p>
                  <p className="mt-1 text-xs text-ops-tx3">.csv · .xlsx · .xls</p>
                </div>
              )}
            </div>
          </div>
          <div className={footerBar}>
            <button onClick={() => setStep("select")} className={btnSecondary}>
              Atrás
            </button>
            <button onClick={handleFileUpload} disabled={!selectedFile || isPending} className={btnPrimary}>
              {isPending ? "Procesando..." : "Subir archivo"}
            </button>
          </div>
        </Panel>
      )}

      {/* ── Step 3: Column mapping ──────────────────────────────────────────── */}
      {step === "mapping" && (
        <Panel>
          <div className="space-y-4 p-5">
            <div>
              <h2 className="text-sm font-semibold text-ops-tx">Mapeo de columnas</h2>
              <p className="mt-0.5 text-sm text-ops-tx2">
                Indica a qué campo interno corresponde cada columna de tu archivo.
                Las columnas marcadas como &quot;(Ignorar)&quot; no se importarán.
              </p>
            </div>
            <ColumnMapper
              columns={columns}
              mapping={mapping}
              onChange={setMapping}
              fieldLabels={TARGET_FIELD_LABELS}
            />
          </div>
          <div className={footerBar}>
            <button onClick={() => setStep("upload")} className={btnSecondary}>
              Atrás
            </button>
            <button onClick={handleSaveMapping} disabled={isPending} className={btnPrimary}>
              {isPending ? "Analizando..." : "Continuar"}
            </button>
          </div>
        </Panel>
      )}

      {/* ── Step 4: Dry-run preview ─────────────────────────────────────────── */}
      {step === "dryrun" && dryRunResult && (
        <div className="space-y-4">
          <DryRunPreview result={dryRunResult} fieldLabels={TARGET_FIELD_LABELS} mapping={mapping} />
          <div className={cn(footerBar, "rounded-lg border border-ops-line")}>
            <button onClick={() => setStep("mapping")} className={btnSecondary}>
              Cambiar mapeo
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={dryRunResult.validRows + dryRunResult.warningRows === 0}
              className={btnPrimary}
            >
              Importar <span className="mx-1 font-plex tabular-nums">{dryRunResult.validRows + dryRunResult.warningRows}</span> leads
            </button>
          </div>
        </div>
      )}

      {/* ── Step 5: Importing ───────────────────────────────────────────────── */}
      {step === "confirm" && (
        <Panel bodyClassName="space-y-3 p-8 text-center" >
          <div role="status" aria-live="polite" className="space-y-3">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-ops-blue border-t-transparent motion-reduce:animate-none" />
            <p className="font-medium text-ops-tx">Importando leads...</p>
            <p className="text-sm text-ops-tx2">Esto puede tomar unos segundos. No cierres esta página.</p>
          </div>
        </Panel>
      )}

      {/* ── Step 6: Done ────────────────────────────────────────────────────── */}
      {step === "done" && importResults && (
        <ImportProgress
          results={importResults}
          onDownloadReport={handleDownloadReport}
          isPending={isPending}
        />
      )}
    </div>
  )
}

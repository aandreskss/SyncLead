"use client"

import { useState, useTransition } from "react"
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

const STEPS: { key: Step; label: string }[] = [
  { key: "select",  label: "Campaña" },
  { key: "upload",  label: "Archivo" },
  { key: "mapping", label: "Mapeo" },
  { key: "dryrun",  label: "Vista previa" },
  { key: "confirm", label: "Importar" },
  { key: "done",    label: "Listo" },
]

function StepBar({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.key === current)
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center">
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
            i < idx ? "text-indigo-400"
            : i === idx ? "bg-indigo-500/20 text-indigo-300"
            : "text-zinc-600"
          }`}>
            <span className={`h-4 w-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i < idx ? "bg-indigo-500 text-white"
              : i === idx ? "bg-indigo-500 text-white"
              : "bg-zinc-800 text-zinc-500"
            }`}>{i + 1}</span>
            {s.label}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-px w-6 mx-1 ${i < idx ? "bg-indigo-500" : "bg-zinc-800"}`} />
          )}
        </div>
      ))}
    </div>
  )
}

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
    <div className="space-y-6">
      <StepBar current={step} />

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ── Step 1: Select campaign ─────────────────────────────────────────── */}
      {step === "select" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <h2 className="font-medium text-zinc-100">Selecciona la campaña de destino</h2>
          <p className="text-sm text-zinc-400">
            Los leads importados se asignarán a esta campaña.
          </p>
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 uppercase tracking-wide">Campaña</label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">— Seleccionar campaña —</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.clientName} · {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSelectCampaign}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Upload file ─────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <h2 className="font-medium text-zinc-100">Sube tu archivo</h2>
          <p className="text-sm text-zinc-400">
            Formatos aceptados: CSV, XLSX, XLS. Tamaño máximo: 5 MB.
            Se usa la primera hoja del archivo XLSX.
          </p>

          <div
            className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-500/50 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) setSelectedFile(f)
            }}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setSelectedFile(f)
              }}
            />
            {selectedFile ? (
              <div className="text-sm">
                <p className="text-zinc-100 font-medium">{selectedFile.name}</p>
                <p className="text-zinc-500 mt-1">{(selectedFile.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="text-zinc-500 text-sm">
                <p>Arrastra un archivo aquí o haz clic para seleccionar</p>
                <p className="text-xs mt-1">.csv · .xlsx · .xls</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep("select")}
              className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              ← Atrás
            </button>
            <button
              onClick={handleFileUpload}
              disabled={!selectedFile || isPending}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {isPending ? "Procesando..." : "Subir archivo"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Column mapping ──────────────────────────────────────────── */}
      {step === "mapping" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <h2 className="font-medium text-zinc-100">Mapeo de columnas</h2>
          <p className="text-sm text-zinc-400">
            Indica a qué campo interno corresponde cada columna de tu archivo.
            Las columnas marcadas como "(Ignorar)" no se importarán.
          </p>
          <ColumnMapper
            columns={columns}
            mapping={mapping}
            onChange={setMapping}
            fieldLabels={TARGET_FIELD_LABELS}
          />
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setStep("upload")}
              className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              ← Atrás
            </button>
            <button
              onClick={handleSaveMapping}
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {isPending ? "Analizando..." : "Vista previa →"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Dry-run preview ─────────────────────────────────────────── */}
      {step === "dryrun" && dryRunResult && (
        <div className="space-y-4">
          <DryRunPreview result={dryRunResult} fieldLabels={TARGET_FIELD_LABELS} mapping={mapping} />
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep("mapping")}
              className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              ← Cambiar mapeo
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={dryRunResult.validRows + dryRunResult.warningRows === 0}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              Importar {dryRunResult.validRows + dryRunResult.warningRows} leads →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 5: Importing ───────────────────────────────────────────────── */}
      {step === "confirm" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center space-y-3">
          <div className="h-10 w-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-zinc-100 font-medium">Importando leads...</p>
          <p className="text-sm text-zinc-500">Esto puede tomar unos segundos. No cierres esta página.</p>
        </div>
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

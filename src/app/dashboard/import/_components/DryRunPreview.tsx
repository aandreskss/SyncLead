"use client"

import type { DryRunResult, ColumnMapping, ParsedRowResult } from "@/domains/import/types"

interface Props {
  result: DryRunResult
  fieldLabels: Record<string, string>
  mapping: ColumnMapping
}

const STATUS_STYLES: Record<string, string> = {
  ok:      "bg-emerald-500/10 text-emerald-400 border-emerald-800",
  warning: "bg-amber-500/10 text-amber-400 border-amber-800",
  error:   "bg-red-500/10 text-red-400 border-red-800",
  skipped: "bg-zinc-500/10 text-zinc-500 border-zinc-700",
}

const STATUS_LABELS: Record<string, string> = {
  ok:      "Válido",
  warning: "Advertencia",
  error:   "Error",
  skipped: "Vacío",
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
    </div>
  )
}

function RowPreview({ row }: { row: ParsedRowResult }) {
  const p = row.parsedRow
  const style = STATUS_STYLES[row.status] ?? STATUS_STYLES.ok

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm space-y-1.5 ${style}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-zinc-600">#{row.rowIndex + 1}</span>
          <span className="font-medium text-zinc-100 truncate">{p?.name ?? "(sin nombre)"}</span>
          {p?.phone && <span className="text-xs text-zinc-500 font-mono">{p.phone}</span>}
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${style}`}>
          {STATUS_LABELS[row.status] ?? row.status}
        </span>
      </div>

      {row.warnings.length > 0 && (
        <ul className="text-xs space-y-0.5 opacity-80">
          {row.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
        </ul>
      )}
      {row.errors.length > 0 && (
        <ul className="text-xs space-y-0.5 opacity-80">
          {row.errors.map((e, i) => <li key={i}>✕ {e}</li>)}
        </ul>
      )}
      {p && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-500">
          {p.email && <span>📧 {p.email}</span>}
          {p.city && <span>📍 {p.city}</span>}
          {p.isSale && p.saleAmount && <span className="text-emerald-400">$ {p.saleAmount}</span>}
          {p.createdAt && <span>📅 {p.createdAt.toLocaleDateString("es")}</span>}
        </div>
      )}
    </div>
  )
}

export function DryRunPreview({ result, fieldLabels: _fieldLabels, mapping: _mapping }: Props) {
  const importable = result.validRows + result.warningRows

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <SummaryCard label="Total filas"     value={result.totalRows}    color="text-zinc-100" />
        <SummaryCard label="Válidos"         value={result.validRows}    color="text-emerald-400" />
        <SummaryCard label="Con advertencia" value={result.warningRows}  color="text-amber-400" />
        <SummaryCard label="Duplicados"      value={result.duplicateRows} color="text-blue-400" />
        <SummaryCard label="Con error"       value={result.errorRows}    color="text-red-400" />
        <SummaryCard label="Vacíos"          value={result.skippedRows}  color="text-zinc-500" />
      </div>

      {/* Batch warnings */}
      {result.batchWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm text-amber-300 space-y-1">
          {result.batchWarnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}

      {/* Info banner */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-xs text-zinc-400">
        {importable > 0
          ? `Se importarán ${importable} leads${result.warningRows > 0 ? ` (${result.warningRows} con advertencia)` : ""}. Los duplicados y vacíos se omitirán.`
          : "No hay filas importables. Corrige los errores o ajusta el mapeo de columnas."}
        {" "}Las ventas importadas <strong>no se enviarán</strong> a Meta CAPI.
      </div>

      {/* Row preview */}
      {result.previewRows.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs text-zinc-400 uppercase tracking-wide">
            Vista previa — primeras {result.previewRows.length} filas
          </h3>
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {result.previewRows.map((row) => (
              <RowPreview key={row.rowIndex} row={row} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

"use client"

import { cn } from "@/lib/utils"
import { Panel, StatusChip } from "@/components/app/ops"
import type { DryRunResult, ColumnMapping, ParsedRowResult } from "@/domains/import/types"

interface Props {
  result: DryRunResult
  fieldLabels: Record<string, string>
  mapping: ColumnMapping
}

const STATUS_TONES: Record<string, "green" | "amber" | "coral" | "neutral"> = {
  ok: "green",
  warning: "amber",
  error: "coral",
  skipped: "neutral",
}

const STATUS_LABELS: Record<string, string> = {
  ok:      "Válido",
  warning: "Advertencia",
  error:   "Error",
  skipped: "Vacío",
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-ops-s1 px-4 py-3">
      <p className="text-xs text-ops-tx3">{label}</p>
      <p className={cn("font-plex text-xl font-semibold tabular-nums", color)}>{value}</p>
    </div>
  )
}

function RowPreview({ row }: { row: ParsedRowResult }) {
  const p = row.parsedRow
  const tone = STATUS_TONES[row.status] ?? "green"

  return (
    <div className="space-y-1.5 border-b border-ops-line px-4 py-3 text-sm last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-plex tabular-nums text-ops-tx3">#{row.rowIndex + 1}</span>
          <span className="font-medium text-ops-tx truncate">{p?.name ?? "(sin nombre)"}</span>
          {p?.phone && <span className="text-xs text-ops-tx2 font-plex tabular-nums">{p.phone}</span>}
        </div>
        <StatusChip tone={tone}>{STATUS_LABELS[row.status] ?? row.status}</StatusChip>
      </div>

      {row.warnings.length > 0 && (
        <ul className="space-y-0.5 text-xs text-ops-amber">
          {row.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
        </ul>
      )}
      {row.errors.length > 0 && (
        <ul className="space-y-0.5 text-xs text-ops-coral">
          {row.errors.map((e, i) => <li key={i}>✕ {e}</li>)}
        </ul>
      )}
      {p && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ops-tx3">
          {p.email && <span>📧 {p.email}</span>}
          {p.city && <span>📍 {p.city}</span>}
          {p.isSale && p.saleAmount && <span className="text-ops-green">$ {p.saleAmount}</span>}
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
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-ops-line bg-ops-line sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Total filas"     value={result.totalRows}    color="text-ops-tx" />
        <SummaryCard label="Válidos"         value={result.validRows}    color="text-ops-green" />
        <SummaryCard label="Con advertencia" value={result.warningRows}  color="text-ops-amber" />
        <SummaryCard label="Duplicados"      value={result.duplicateRows} color="text-ops-blue-t" />
        <SummaryCard label="Con error"       value={result.errorRows}    color="text-ops-coral" />
        <SummaryCard label="Vacíos"          value={result.skippedRows}  color="text-ops-tx3" />
      </div>

      {/* Batch warnings */}
      {result.batchWarnings.length > 0 && (
        <div className="rounded-lg border border-ops-amber/40 bg-ops-amber/10 px-4 py-3 text-sm text-ops-amber space-y-1">
          {result.batchWarnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}

      {/* Info banner */}
      <div className="rounded-lg border border-ops-line bg-ops-s1 px-4 py-3 text-[13px] text-ops-tx2">
        {importable > 0
          ? `Se importarán ${importable} leads${result.warningRows > 0 ? ` (${result.warningRows} con advertencia)` : ""}. Los duplicados y vacíos se omitirán.`
          : "No hay filas importables. Corrige los errores o ajusta el mapeo de columnas."}
        {" "}Las ventas importadas <strong>no se enviarán</strong> a Meta CAPI.
      </div>

      {/* Row preview */}
      {result.previewRows.length > 0 && (
        <Panel title={`Vista previa — primeras ${result.previewRows.length} filas`}>
          <div className="max-h-[480px] overflow-y-auto border-t border-ops-line">
            {result.previewRows.map((row) => (
              <RowPreview key={row.rowIndex} row={row} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

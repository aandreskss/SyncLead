"use client"

import { cn } from "@/lib/utils"
import { Panel, StatusChip, opsTable } from "@/components/app/ops"
import type { ImportRowResult } from "@/domains/import/types"

interface Props {
  results: ImportRowResult[]
  onDownloadReport: () => void
  isPending: boolean
}

const STATUS_TONES: Record<string, "green" | "amber" | "blue" | "neutral" | "coral"> = {
  imported:  "green",
  warning:   "amber",
  duplicate: "blue",
  skipped:   "neutral",
  failed:    "coral",
}

const STATUS_LABELS: Record<string, string> = {
  imported:  "Importado",
  warning:   "Con advertencia",
  duplicate: "Duplicado",
  skipped:   "Vacío",
  failed:    "Error",
}

export function ImportProgress({ results, onDownloadReport, isPending }: Props) {
  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  const imported = (counts.imported ?? 0) + (counts.warning ?? 0)
  const failed = counts.failed ?? 0
  const skipped = (counts.skipped ?? 0) + (counts.duplicate ?? 0)

  return (
    <div className="space-y-5">
      {/* Result banner */}
      <div role="status" className={cn(
        "rounded-lg border bg-ops-s1 p-5 text-center",
        failed > 0 ? "border-ops-amber/40" : "border-ops-green/40"
      )}>
        <p className={cn("font-plex text-3xl font-semibold tabular-nums", failed > 0 ? "text-ops-amber" : "text-ops-green")}>
          {imported}
        </p>
        <p className="text-ops-tx mt-1 font-medium">leads importados</p>
        <div className="flex items-center justify-center gap-6 mt-3 text-xs text-ops-tx2">
          {skipped > 0 && <span>{skipped} omitidos</span>}
          {counts.warning && <span className="text-ops-amber">{counts.warning} con advertencia</span>}
          {failed > 0 && <span className="text-ops-coral">{failed} fallaron</span>}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 justify-end">
        <button
          onClick={onDownloadReport}
          disabled={isPending}
          className="inline-flex h-9 items-center rounded-md border border-ops-bd px-4 text-[13px] font-medium text-ops-tx2 transition-colors hover:border-ops-bd2 hover:bg-ops-hover hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-ops-blue disabled:opacity-50"
        >
          {isPending ? "Generando..." : "Descargar reporte CSV"}
        </button>
        <a
          href="/dashboard"
          className="inline-flex h-9 items-center rounded-md bg-ops-blue px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-blue"
        >
          Ir al dashboard
        </a>
      </div>

      {/* Row detail */}
      {results.length > 0 && (
        <Panel title="Detalle por fila" bodyClassName={opsTable.wrap}>
          <table className={cn(opsTable.table, "min-w-[560px]")}>
            <thead>
              <tr>
                <th className={cn(opsTable.thRight, "w-16")}>Fila</th>
                <th className={opsTable.th}>Nombre</th>
                <th className={cn(opsTable.th, "w-36")}>Estado</th>
                <th className={opsTable.th}>Nota</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.rowIndex} className={opsTable.row}>
                  <td className={cn(opsTable.tdRight, opsTable.mono, "py-2 text-ops-tx3")}>{r.rowIndex + 1}</td>
                  <td className={cn(opsTable.td, "max-w-[180px] truncate py-2")}>{r.name ?? "(sin nombre)"}</td>
                  <td className={cn(opsTable.td, "py-2")}>
                    <StatusChip tone={STATUS_TONES[r.status] ?? "neutral"}>{STATUS_LABELS[r.status] ?? r.status}</StatusChip>
                  </td>
                  <td className={cn(opsTable.td, "max-w-[240px] truncate py-2 text-ops-tx2")}>{r.warning ?? r.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  )
}

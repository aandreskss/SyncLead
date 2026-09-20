"use client"

import type { ImportRowResult } from "@/domains/import/types"

interface Props {
  results: ImportRowResult[]
  onDownloadReport: () => void
  isPending: boolean
}

const STATUS_COLORS: Record<string, string> = {
  imported:  "text-emerald-400",
  warning:   "text-amber-400",
  duplicate: "text-blue-400",
  skipped:   "text-zinc-500",
  failed:    "text-red-400",
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
    <div className="space-y-6">
      {/* Result banner */}
      <div className={`rounded-xl border p-6 text-center ${
        failed > 0 ? "border-amber-800 bg-amber-950/20" : "border-emerald-800 bg-emerald-950/20"
      }`}>
        <p className={`text-3xl font-bold ${failed > 0 ? "text-amber-400" : "text-emerald-400"}`}>
          {imported}
        </p>
        <p className="text-zinc-300 mt-1 font-medium">leads importados</p>
        <div className="flex items-center justify-center gap-6 mt-3 text-xs text-zinc-500">
          {skipped > 0 && <span>{skipped} omitidos</span>}
          {counts.warning && <span className="text-amber-400">{counts.warning} con advertencia</span>}
          {failed > 0 && <span className="text-red-400">{failed} fallaron</span>}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 justify-end">
        <button
          onClick={onDownloadReport}
          disabled={isPending}
          className="px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-sm font-medium transition-colors"
        >
          {isPending ? "Generando..." : "Descargar reporte CSV"}
        </button>
        <a
          href="/dashboard"
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          Ir al dashboard →
        </a>
      </div>

      {/* Row detail */}
      {results.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs text-zinc-400 uppercase tracking-wide">Detalle por fila</h3>
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950">
                  <th className="text-left px-3 py-2 text-zinc-500 w-16">Fila</th>
                  <th className="text-left px-3 py-2 text-zinc-500">Nombre</th>
                  <th className="text-left px-3 py-2 text-zinc-500 w-28">Estado</th>
                  <th className="text-left px-3 py-2 text-zinc-500">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {results.map((r) => (
                  <tr key={r.rowIndex} className="bg-zinc-900 hover:bg-zinc-800/50">
                    <td className="px-3 py-2 text-zinc-600 font-mono">{r.rowIndex + 1}</td>
                    <td className="px-3 py-2 text-zinc-300 truncate max-w-[180px]">
                      {r.name ?? "(sin nombre)"}
                    </td>
                    <td className={`px-3 py-2 font-medium ${STATUS_COLORS[r.status] ?? ""}`}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </td>
                    <td className="px-3 py-2 text-zinc-500 truncate max-w-[240px]">
                      {r.warning ?? r.error ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

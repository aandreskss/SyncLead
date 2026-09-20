"use client"

import type { ColumnMapping } from "@/domains/import/types"

interface Props {
  columns: string[]
  mapping: ColumnMapping
  onChange: (mapping: ColumnMapping) => void
  fieldLabels: Record<string, string>
}

export function ColumnMapper({ columns, mapping, onChange, fieldLabels }: Props) {
  const fieldOptions = Object.entries(fieldLabels).sort(([, a], [, b]) => {
    // __skip always last
    if (a === "(Ignorar columna)") return 1
    if (b === "(Ignorar columna)") return -1
    return a.localeCompare(b)
  })

  function handleChange(col: string, target: string) {
    onChange({ ...mapping, [col]: target })
  }

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-950">
            <th className="text-left px-4 py-2.5 text-xs text-zinc-400 font-medium w-1/2">
              Columna en el archivo
            </th>
            <th className="text-left px-4 py-2.5 text-xs text-zinc-400 font-medium w-1/2">
              Campo de SyncLead
            </th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col, i) => (
            <tr
              key={col}
              className={`border-b border-zinc-800 last:border-b-0 ${i % 2 === 0 ? "bg-zinc-900" : "bg-zinc-900/50"}`}
            >
              <td className="px-4 py-2.5 text-zinc-200 font-mono text-xs">{col}</td>
              <td className="px-4 py-2.5">
                <select
                  value={mapping[col] ?? "__skip"}
                  onChange={(e) => handleChange(col, e.target.value)}
                  className={`w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${
                    mapping[col] === "__skip"
                      ? "border-zinc-700 bg-zinc-800 text-zinc-500"
                      : "border-indigo-700/50 bg-indigo-950/30 text-indigo-300"
                  }`}
                >
                  {fieldOptions.map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

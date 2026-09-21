"use client"

import type { ColumnMapping } from "@/domains/import/types"
import { cn } from "@/lib/utils"
import { opsTable, opsField } from "@/components/app/ops"

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
    <div className="overflow-hidden rounded-lg border border-ops-line">
      <div className={opsTable.wrap}>
      <table className={cn(opsTable.table, "min-w-[480px]")}>
        <thead>
          <tr>
            <th className={cn(opsTable.th, "w-1/2")}>
              Columna en el archivo
            </th>
            <th className={cn(opsTable.th, "w-1/2")}>
              Campo de SyncLead
            </th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col) => (
            <tr key={col} className={opsTable.row}>
              <td className={cn(opsTable.td, "py-2 font-plex text-xs")}>{col}</td>
              <td className={cn(opsTable.td, "py-2")}>
                <select
                  value={mapping[col] ?? "__skip"}
                  onChange={(e) => handleChange(col, e.target.value)}
                  aria-label={`Campo para la columna ${col}`}
                  className={cn(
                    opsField,
                    "w-full",
                    mapping[col] === "__skip" ? "text-ops-tx3" : "border-ops-blue/50 text-ops-blue-t"
                  )}
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
    </div>
  )
}

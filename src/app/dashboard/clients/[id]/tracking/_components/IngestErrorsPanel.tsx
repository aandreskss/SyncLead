"use client"

import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"
import type { IngestErrorPublic } from "@/domains/tracking/actions"

const SOURCE_LABEL: Record<string, string> = {
  form:   "Formulario",
  server: "Servidor",
  legacy: "Legacy",
}

function formatRelative(date: Date): string {
  const now = Date.now()
  const diff = now - new Date(date).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "ahora"
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}

export function IngestErrorsPanel({ errors }: { errors: IngestErrorPublic[] }) {
  const [expanded, setExpanded] = useState(false)

  if (errors.length === 0) {
    return (
      <div className="rounded-lg border border-ops-bd bg-ops-s1 px-4 py-3 flex items-center gap-2 text-sm text-ops-tx3">
        <span className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
        Sin errores de ingest en las últimas 24 h
      </div>
    )
  }

  const visible = expanded ? errors : errors.slice(0, 5)

  return (
    <div className="rounded-lg border border-amber-500/30 bg-ops-s1 overflow-hidden">
      <div className="px-4 py-3 border-b border-ops-bd flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
        <p className="text-sm font-medium text-ops-tx">
          {errors.length} error{errors.length !== 1 ? "es" : ""} de ingest recientes
        </p>
        <p className="ml-auto text-xs text-ops-tx3">Solo nombres de campos — sin valores</p>
      </div>
      <div className="divide-y divide-ops-bd">
        {visible.map((err) => (
          <div key={err.id} className="px-4 py-2.5 flex items-start gap-3 text-sm">
            <span className="mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase bg-zinc-800 text-ops-tx3">
              {SOURCE_LABEL[err.source] ?? err.source}
            </span>
            <div className="flex-1 min-w-0">
              {err.campaignName && (
                <span className="text-ops-tx2 font-medium mr-1">{err.campaignName}</span>
              )}
              <span className="text-ops-tx3">{err.errorDetail ?? err.errorType}</span>
            </div>
            <span className="flex-shrink-0 text-xs text-ops-tx3">{formatRelative(err.occurredAt)}</span>
          </div>
        ))}
      </div>
      {errors.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-2 text-xs text-ops-tx3 hover:text-ops-tx flex items-center justify-center gap-1 border-t border-ops-bd"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" /> Mostrar menos</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> Ver {errors.length - 5} más</>
          )}
        </button>
      )}
    </div>
  )
}

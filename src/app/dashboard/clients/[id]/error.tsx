"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

export default function ClientPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[ClientPage]", error)
  }, [error])

  return (
    <div className="max-w-2xl px-4 py-5 md:px-7 md:py-6">
      <div className="space-y-4 rounded-lg border border-ops-coral/30 bg-ops-s1 p-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-ops-coral flex-shrink-0" />
          <h2 className="text-sm font-semibold text-ops-tx">Error al cargar la página</h2>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-plex text-ops-coral bg-ops-s2 rounded-md px-3 py-2 break-all">
            {error.message || "Error desconocido"}
          </p>
          {error.digest && (
            <p className="text-xs text-ops-tx3 font-plex">digest: {error.digest}</p>
          )}
        </div>
        <button
          onClick={reset}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ops-bd px-3 text-[13px] text-ops-tx transition-colors hover:bg-ops-hover focus-visible:outline-2 focus-visible:outline-ops-blue"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reintentar
        </button>
      </div>
    </div>
  )
}

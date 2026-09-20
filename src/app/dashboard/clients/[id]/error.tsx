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
    <div className="p-6 max-w-2xl">
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <h2 className="text-sm font-semibold text-red-300">Error al cargar la página</h2>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-mono text-red-400 bg-red-500/10 rounded px-3 py-2 break-all">
            {error.message || "Error desconocido"}
          </p>
          {error.digest && (
            <p className="text-xs text-zinc-600 font-mono">digest: {error.digest}</p>
          )}
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reintentar
        </button>
      </div>
    </div>
  )
}

"use client"

import { useState, useTransition } from "react"
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle } from "lucide-react"
import { triggerSyncAction } from "@/domains/meta-insights/actions"

interface Props {
  clientId: string
  connectionId: string
  syncType?: "initial" | "incremental"
  label?: string
  variant?: "primary" | "ghost"
}

export function InsightsSyncButton({
  clientId,
  connectionId,
  syncType = "incremental",
  label = "Sincronizar",
  variant = "ghost",
}: Props) {
  const [isPending, start] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  function handleSync() {
    setResult(null)
    start(async () => {
      const res = await triggerSyncAction({ connectionId, clientId, syncType })
      if (res.success) {
        setResult({ ok: true, msg: `${res.recordsSynced ?? 0} registros actualizados` })
        // Reload page to show fresh data
        setTimeout(() => window.location.reload(), 800)
      } else {
        setResult({ ok: false, msg: res.error ?? "Error al sincronizar" })
      }
    })
  }

  const base =
    variant === "primary"
      ? "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors bg-ops-blue text-white hover:bg-ops-blue/80 disabled:opacity-50"
      : "flex items-center gap-1.5 rounded-lg border border-ops-bd px-3 py-1.5 text-xs font-medium transition-colors text-ops-tx2 hover:text-ops-tx hover:border-ops-bd2 disabled:opacity-50"

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={handleSync} disabled={isPending} className={base}>
        {isPending
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <RefreshCw className="h-3.5 w-3.5" />}
        {label}
      </button>
      {result && (
        <span className={`flex items-center gap-1 text-xs ${result.ok ? "text-ops-green" : "text-ops-coral"}`}>
          {result.ok
            ? <CheckCircle2 className="h-3 w-3" />
            : <AlertTriangle className="h-3 w-3" />}
          {result.msg}
        </span>
      )}
    </div>
  )
}

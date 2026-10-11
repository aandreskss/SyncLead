"use client"

import { useEffect, useState } from "react"
import { getBudgetStatusAction } from "@/domains/ai-agents/budget-actions"

type Status = Awaited<ReturnType<typeof getBudgetStatusAction>>["status"]

export function BudgetStatusBar() {
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    getBudgetStatusAction().then(res => {
      if (res.success) setStatus(res.status)
    })
  }, [])

  if (!status || !status.limits) return null

  const alert = status.alert
  const pct = alert?.percentUsed ?? null

  return (
    <div className={`rounded-2xl border px-5 py-4 shadow-ops-card ${alert?.shouldAlert ? "border-amber-200 bg-amber-50" : "border-ops-line bg-ops-s1"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ops-tx3">Presupuesto diario</p>
          <p className="text-sm font-medium text-ops-tx">
            {status.dailySpendUsd} de {status.dailyLimitUsd ?? "sin límite"}
            {pct !== null && <span className="ml-2 text-ops-tx2">({pct}%)</span>}
          </p>
          {alert?.shouldAlert && (
            <p className="text-xs font-semibold text-amber-700">
              Alerta: superaste el {alert.alertThresholdPct}% del límite diario
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[11px] text-ops-tx3">Mes actual</p>
          <p className="text-sm font-medium text-ops-tx">
            {status.monthlySpendUsd}
            {status.monthlyLimitUsd && <span className="text-ops-tx3"> / {status.monthlyLimitUsd}</span>}
          </p>
        </div>
      </div>

      {/* Progress bar (only if daily limit configured) */}
      {status.limits.dailyLimitMillicents && pct !== null && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ops-line">
          <div
            className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-red-500" : pct >= (alert?.alertThresholdPct ?? 80) ? "bg-amber-500" : "bg-ops-blue"}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

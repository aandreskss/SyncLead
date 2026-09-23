"use client"

import { useState, useTransition } from "react"
import { ShoppingCart, CheckCircle2, XCircle, TrendingDown } from "lucide-react"
import { getCheckoutFunnelAction } from "@/domains/tracking/actions"
import type { CheckoutFunnelMetrics } from "@/domains/tracking/actions"

type Props = {
  clientId: string
  initial: CheckoutFunnelMetrics
}

const DAYS_OPTIONS = [7, 30, 90] as const

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%"
}

export function CheckoutFunnelWidget({ clientId, initial }: Props) {
  const [days, setDays] = useState<(typeof DAYS_OPTIONS)[number]>(30)
  const [data, setData] = useState<CheckoutFunnelMetrics>(initial)
  const [isPending, startTransition] = useTransition()

  function handleDaysChange(d: (typeof DAYS_OPTIONS)[number]) {
    setDays(d)
    startTransition(async () => {
      const res = await getCheckoutFunnelAction(clientId, d)
      if (res.data) setData(res.data)
    })
  }

  const hasData = data.startedCount > 0

  return (
    <div className="rounded-lg border border-ops-line bg-ops-s1">
      <div className="flex items-center justify-between border-b border-ops-line px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-ops-tx3" />
          <h2 className="text-sm font-medium text-ops-tx">Abandono de carrito</h2>
        </div>
        <div className="flex items-center gap-1">
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDaysChange(d)}
              disabled={isPending}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                days === d
                  ? "bg-ops-sel text-ops-tx"
                  : "text-ops-tx3 hover:text-ops-tx2"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className={`transition-opacity ${isPending ? "opacity-50" : ""}`}>
        {!hasData ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-ops-tx3">Sin datos de checkout en los últimos {days} días.</p>
            <p className="text-xs text-ops-tx3 mt-1">
              Instala <code className="text-ops-tx2">begin_checkout</code> y <code className="text-ops-tx2">checkout_completed</code> en tu sitio.
            </p>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-3 divide-x divide-ops-line border-b border-ops-line">
              <div className="px-4 py-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <ShoppingCart className="h-3.5 w-3.5 text-ops-tx3" />
                  <span className="text-xs text-ops-tx3">Iniciaron</span>
                </div>
                <span className="text-2xl font-bold text-ops-tx">{data.startedCount}</span>
              </div>
              <div className="px-4 py-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-xs text-ops-tx3">Completaron</span>
                </div>
                <span className="text-2xl font-bold text-ops-tx">{data.completedCount}</span>
              </div>
              <div className="px-4 py-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <TrendingDown className="h-3.5 w-3.5 text-ops-coral" />
                  <span className="text-xs text-ops-tx3">Tasa abandono</span>
                </div>
                <span className={`text-2xl font-bold ${data.abandonmentRate > 0.7 ? "text-ops-coral" : data.abandonmentRate > 0.4 ? "text-amber-400" : "text-green-400"}`}>
                  {pct(data.abandonmentRate)}
                </span>
              </div>
            </div>

            {/* Barra de progreso */}
            <div className="px-4 py-3 border-b border-ops-line">
              <div className="flex items-center justify-between text-xs text-ops-tx3 mb-1.5">
                <span>{data.completedCount} completados</span>
                <span>{data.abandonedCount} abandonados</span>
              </div>
              <div className="h-2 w-full rounded-full bg-ops-s2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{ width: `${(data.completedCount / data.startedCount) * 100}%` }}
                />
              </div>
            </div>

            {/* Por fuente */}
            {data.bySource.length > 0 && (
              <div className="px-4 py-3">
                <p className="text-xs font-medium text-ops-tx3 uppercase tracking-wide mb-2">Por fuente de tráfico</p>
                <div className="space-y-2">
                  {data.bySource.map((row) => (
                    <div key={row.source} className="flex items-center gap-3">
                      <span className="text-xs text-ops-tx2 w-24 truncate shrink-0">{row.source}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-ops-s2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-ops-blue transition-all"
                          style={{ width: row.started > 0 ? `${(row.completed / row.started) * 100}%` : "0%" }}
                        />
                      </div>
                      <span className="text-xs text-ops-tx3 w-16 text-right shrink-0">
                        {row.completed}/{row.started} completados
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

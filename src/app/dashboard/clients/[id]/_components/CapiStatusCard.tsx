"use client"

import Link from "next/link"
import type { ClientCapiStats } from "@/domains/health/repository"

interface Props {
  clientId: string
  stats: ClientCapiStats
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  sent: { label: "Enviado", cls: "text-emerald-400" },
  failed: { label: "Fallido", cls: "text-red-400" },
  pending: { label: "Pendiente", cls: "text-yellow-400" },
  retrying: { label: "Reintentando", cls: "text-orange-400" },
  processing: { label: "Procesando", cls: "text-blue-400" },
  cancelled: { label: "Cancelado", cls: "text-zinc-500" },
  skipped: { label: "Omitido", cls: "text-zinc-500" },
}

function formatAge(date: Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (d > 0) return `hace ${d}d`
  if (h > 0) return `hace ${h}h`
  if (m > 0) return `hace ${m}m`
  return "ahora"
}

export function CapiStatusCard({ clientId, stats }: Props) {
  const successRate =
    stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : null

  const hasProblems = stats.failed > 0 || stats.retrying > 0

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-zinc-200">Estado CAPI (últimos 30 días)</h3>
        <p className="text-xs text-zinc-500 mt-0.5">
          Eventos de conversión enviados a Meta vía Conversions API.
        </p>
      </div>

      {stats.total === 0 ? (
        <p className="text-sm text-zinc-500">Sin eventos en los últimos 30 días.</p>
      ) : (
        <>
          {/* Resumen numérico */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Enviados" value={stats.sent} color="emerald" />
            <StatTile label="Fallidos" value={stats.failed} color={stats.failed > 0 ? "red" : "zinc"} />
            <StatTile label="Pendientes" value={stats.pending} color={stats.pending > 0 ? "yellow" : "zinc"} />
            <StatTile label="Total" value={stats.total} color="zinc" suffix={successRate !== null ? `${successRate}% éxito` : undefined} />
          </div>

          {/* Alerta si hay problemas */}
          {hasProblems && (
            <div className="flex items-center justify-between rounded border border-red-800/50 bg-red-900/20 px-3 py-2">
              <p className="text-xs text-red-300">
                {stats.failed > 0 && `${stats.failed} evento${stats.failed > 1 ? "s" : ""} en dead-letter.`}
                {stats.failed > 0 && stats.retrying > 0 && " "}
                {stats.retrying > 0 && `${stats.retrying} reintentando.`}
              </p>
              <Link
                href="/dashboard/health"
                className="text-xs text-red-400 hover:text-red-300 underline shrink-0 ml-3"
              >
                Ver en Salud →
              </Link>
            </div>
          )}

          {/* Últimos eventos */}
          {stats.recentEvents.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                Eventos recientes
              </p>
              <div className="rounded border border-zinc-800 overflow-hidden">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-zinc-800/60">
                    {stats.recentEvents.map((ev) => {
                      const cfg = STATUS_CONFIG[ev.status] ?? { label: ev.status, cls: "text-zinc-400" }
                      return (
                        <tr key={ev.id} className="bg-zinc-900 hover:bg-zinc-800/40">
                          <td className="px-3 py-2 font-mono text-zinc-300">{ev.eventName}</td>
                          <td className="px-3 py-2">
                            <span className={`font-medium ${cfg.cls}`}>{cfg.label}</span>
                            {ev.attemptCount > 1 && (
                              <span className="text-zinc-600 ml-1">({ev.attemptCount} intentos)</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-zinc-600 text-right">{formatAge(ev.createdAt)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatTile({
  label,
  value,
  color,
  suffix,
}: {
  label: string
  value: number
  color: "emerald" | "red" | "yellow" | "zinc"
  suffix?: string
}) {
  const colorMap = {
    emerald: "text-emerald-400",
    red: "text-red-400",
    yellow: "text-yellow-400",
    zinc: "text-zinc-300",
  }
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2.5">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-xl font-semibold mt-0.5 ${colorMap[color]}`}>{value}</p>
      {suffix && <p className="text-xs text-zinc-500 mt-0.5">{suffix}</p>}
    </div>
  )
}

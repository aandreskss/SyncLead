"use client"

import Link from "next/link"
import type { ClientCapiStats } from "@/domains/health/repository"

interface Props {
  clientId: string
  stats: ClientCapiStats
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  sent: { label: "Enviado", cls: "text-ops-green" },
  failed: { label: "Fallido", cls: "text-ops-coral" },
  pending: { label: "Pendiente", cls: "text-yellow-400" },
  retrying: { label: "Reintentando", cls: "text-orange-400" },
  processing: { label: "Procesando", cls: "text-blue-400" },
  cancelled: { label: "Cancelado", cls: "text-ops-tx3" },
  skipped: { label: "Omitido", cls: "text-ops-tx3" },
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
        <h3 className="text-sm font-medium text-ops-tx">Estado CAPI (últimos 30 días)</h3>
        <p className="text-xs text-ops-tx3 mt-0.5">
          Eventos de conversión enviados a Meta vía Conversions API.
        </p>
      </div>

      {stats.total === 0 ? (
        <p className="text-sm text-ops-tx3">Sin eventos en los últimos 30 días.</p>
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
              <p className="text-xs text-ops-coral">
                {stats.failed > 0 && `${stats.failed} evento${stats.failed > 1 ? "s" : ""} en dead-letter.`}
                {stats.failed > 0 && stats.retrying > 0 && " "}
                {stats.retrying > 0 && `${stats.retrying} reintentando.`}
              </p>
              <Link
                href="/dashboard/health"
                className="text-xs text-ops-coral hover:text-ops-coral underline shrink-0 ml-3"
              >
                Ver en Salud →
              </Link>
            </div>
          )}

          {/* Últimos eventos */}
          {stats.recentEvents.length > 0 && (
            <div>
              <p className="text-xs font-medium text-ops-tx3 uppercase tracking-wider mb-2">
                Eventos recientes
              </p>
              <div className="rounded border border-ops-line overflow-hidden">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-ops-line/60">
                    {stats.recentEvents.map((ev) => {
                      const cfg = STATUS_CONFIG[ev.status] ?? { label: ev.status, cls: "text-ops-tx2" }
                      return (
                        <tr key={ev.id} className="bg-ops-s1 hover:bg-ops-s2/40">
                          <td className="px-3 py-2 font-mono text-ops-tx2">{ev.eventName}</td>
                          <td className="px-3 py-2">
                            <span className={`font-medium ${cfg.cls}`}>{cfg.label}</span>
                            {ev.attemptCount > 1 && (
                              <span className="text-ops-tx3 ml-1">({ev.attemptCount} intentos)</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-ops-tx3 text-right">{formatAge(ev.createdAt)}</td>
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
    emerald: "text-ops-green",
    red: "text-ops-coral",
    yellow: "text-yellow-400",
    zinc: "text-ops-tx2",
  }
  return (
    <div className="rounded border border-ops-line bg-ops-s1 px-3 py-2.5">
      <p className="text-xs text-ops-tx3">{label}</p>
      <p className={`text-xl font-semibold mt-0.5 ${colorMap[color]}`}>{value}</p>
      {suffix && <p className="text-xs text-ops-tx3 mt-0.5">{suffix}</p>}
    </div>
  )
}

"use client"

import type { ConversationRow } from "@/domains/ai-agents/analytics-repository"
import { formatMillicentsAsUsd } from "@/domains/ai-agents/cost-calculator"

interface Props {
  rows: ConversationRow[]
  total: number
  page: number
  pageSize: number
  onPage: (p: number) => void
  loading: boolean
}

const EXIT_LABELS: Record<string, string> = {
  objective_met: "Objetivo",
  transfer_rule: "Transferido",
  inactivity: "Inactividad",
  budget: "Presupuesto",
  max_messages: "Límite mensajes",
  human_took_over: "Humano",
  error: "Error",
}

function exitLabel(reason: string | null): string {
  if (!reason) return "—"
  return EXIT_LABELS[reason] ?? reason
}

function exitBadge(reason: string | null) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
  if (!reason) return <span className={`${base} bg-ops-hover text-ops-tx3`}>Activo</span>
  if (reason === "objective_met") return <span className={`${base} bg-green-100 text-green-700`}>Objetivo</span>
  if (reason === "transfer_rule") return <span className={`${base} bg-blue-100 text-blue-700`}>Transferido</span>
  if (reason === "budget") return <span className={`${base} bg-red-100 text-red-700`}>Presupuesto</span>
  if (reason === "error") return <span className={`${base} bg-red-100 text-red-700`}>Error</span>
  return <span className={`${base} bg-ops-hover text-ops-tx2`}>{exitLabel(reason)}</span>
}

function tempBadge(temp: string | null) {
  if (!temp) return null
  const map: Record<string, string> = {
    hot: "bg-red-100 text-red-700",
    warm: "bg-orange-100 text-orange-700",
    cold: "bg-blue-100 text-blue-700",
  }
  const cls = map[temp] ?? "bg-ops-hover text-ops-tx2"
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {temp}
    </span>
  )
}

function fmtDate(d: Date | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleString("es-VE", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })
}

export function EpisodesTable({ rows, total, page, pageSize, onPage, loading }: Props) {
  const totalPages = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ops-tx">
          Conversaciones
          {total > 0 && (
            <span className="ml-2 text-xs font-normal text-ops-tx3">
              {start}–{end} de {total}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => onPage(page - 1)}
            className="h-8 rounded-lg border border-ops-bd px-3 text-xs font-medium text-ops-tx2 hover:bg-ops-hover disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-xs text-ops-tx3">{page} / {totalPages || 1}</span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => onPage(page + 1)}
            className="h-8 rounded-lg border border-ops-bd px-3 text-xs font-medium text-ops-tx2 hover:bg-ops-hover disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ops-line shadow-ops-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-ops-line bg-ops-s1">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ops-tx3">Contacto</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ops-tx3">Agente</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ops-tx3">Inicio</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ops-tx3">Estado</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ops-tx3">Lead</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-ops-tx3">Msgs</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-ops-tx3">Costo</th>
            </tr>
          </thead>
          <tbody className={loading ? "opacity-50" : ""}>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-ops-tx3">
                  No hay conversaciones en este período.
                </td>
              </tr>
            ) : rows.map(row => (
              <tr key={`${row.conversationId}-${row.episodeId}`} className="border-b border-ops-line bg-ops-bg hover:bg-ops-hover">
                <td className="px-4 py-3">
                  <p className="font-medium text-ops-tx">{row.customerName ?? row.customerPhone}</p>
                  {row.customerName && <p className="text-xs text-ops-tx3">{row.customerPhone}</p>}
                </td>
                <td className="px-4 py-3 text-ops-tx2">{row.agentName ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-ops-tx2">{fmtDate(row.startedAt)}</td>
                <td className="px-4 py-3">{exitBadge(row.exitReason)}</td>
                <td className="px-4 py-3">{tempBadge(row.leadTemperature)}</td>
                <td className="px-4 py-3 text-right text-ops-tx2">{row.messageCount}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-ops-tx2">
                  {row.totalCostMillicents !== null
                    ? formatMillicentsAsUsd(row.totalCostMillicents)
                    : <span className="text-ops-tx3">N/D</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Metric definitions footer */}
      <details className="rounded-xl border border-ops-line bg-ops-s1 px-4 py-3 text-xs text-ops-tx3">
        <summary className="cursor-pointer font-semibold text-ops-tx2">Definición de métricas</summary>
        <ul className="mt-3 grid gap-1.5 pl-2 sm:grid-cols-2">
          <li><strong>Episodio</strong>: Sesión de trabajo de un agente con una conversación. Una conversación puede tener múltiples episodios.</li>
          <li><strong>Costo (LLM)</strong>: Tokens de producción × tarifa publicada Anthropic. Sesiones de simulador excluidas. WhatsApp reportado por separado.</li>
          <li><strong>N/D</strong>: Dato no disponible — tarifa no configurada o tokens no registrados. No equivale a cero.</li>
          <li><strong>Leads calificados</strong>: Leads con evaluación ≠ "no calificado" creada durante el período. Fuente: <code>lead_qualifications.evaluated_at</code>.</li>
          <li><strong>Datos completados</strong>: Leads con nombre + teléfono + email todos registrados al momento de la consulta.</li>
          <li><strong>Ventas atribuidas</strong>: Ventas confirmadas en ≤7 días desde el inicio del episodio para el mismo lead. <em>Correlación temporal, no causal.</em> Un lead con varios agentes cuenta una vez.</li>
          <li><strong>1ª resp. humana</strong>: Tiempo promedio desde que arrancó el episodio AI hasta el primer mensaje enviado por un operador humano (outbound, no-AI). N/D si no hubo respuesta humana.</li>
          <li><strong>Costo / lead calificado</strong>: Costo total ÷ leads calificados. Sin datos si denominador es cero.</li>
          <li><strong>Transferido</strong>: Episodio derivado a humano por regla explícita, agotamiento de presupuesto u operador que tomó control.</li>
          <li><strong>Lead (temperatura)</strong>: Temperatura asignada por el motor de calificación al lead de la conversación al momento de la consulta.</li>
        </ul>
      </details>
    </div>
  )
}

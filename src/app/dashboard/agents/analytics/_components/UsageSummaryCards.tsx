"use client"

import type { EpisodeSummary } from "@/domains/ai-agents/analytics-repository"
import { formatMillicentsAsUsd } from "@/domains/ai-agents/cost-calculator"

interface Props {
  summary: EpisodeSummary
}

function Kpi({
  label,
  value,
  sub,
  tip,
}: {
  label: string
  value: string | number
  sub?: string
  tip?: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-ops-line bg-ops-s1 px-5 py-4 shadow-ops-card">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ops-tx3">{label}</p>
      <p className="text-2xl font-semibold tracking-tight text-ops-tx">{value}</p>
      {sub && <p className="text-xs text-ops-tx3">{sub}</p>}
      {tip && <p className="mt-1 text-[11px] text-ops-tx3/70">{tip}</p>}
    </div>
  )
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function UsageSummaryCards({ summary }: Props) {
  const {
    episodesStarted,
    episodesActive,
    episodesEnded,
    exitReasonBreakdown,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCostMillicents,
    avgCostPerEpisodeMillicents,
    avgLatencyMs,
    messagesDelivered,
    messagesFailed,
    uniqueLeads,
    transfers,
    objectiveMet,
    leadsQualified,
    dataCompleted,
    firstHumanResponseMs,
    salesAttributed,
    costPerQualifiedLeadMillicents,
  } = summary

  const totalTokens = totalInputTokens + totalOutputTokens
  const deliveryRate = (messagesDelivered + messagesFailed) > 0
    ? Math.round(messagesDelivered / (messagesDelivered + messagesFailed) * 100)
    : null

  const exitReasons = Object.entries(exitReasonBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([r, n]) => `${r}: ${n}`)
    .join(" · ")

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-ops-tx">Resumen del período</h2>

      {/* Row 1: Episodes */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Episodios iniciados"
          value={episodesStarted}
          sub={`Activos: ${episodesActive} · Finalizados: ${episodesEnded}`}
          tip={exitReasons || undefined}
        />
        <Kpi
          label="Leads únicos"
          value={uniqueLeads}
          tip="Conversaciones con lead asociado"
        />
        <Kpi
          label="Objetivo cumplido"
          value={objectiveMet}
          sub={episodesEnded > 0 ? `${Math.round(objectiveMet / episodesEnded * 100)}% de finalizados` : undefined}
        />
        <Kpi
          label="Transferencias"
          value={transfers}
          tip="Episodios derivados a humano"
        />
      </div>

      {/* Row 2: Messages & latency */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Mensajes enviados"
          value={messagesDelivered}
          sub={messagesFailed > 0 ? `Fallidos: ${messagesFailed}` : "Sin fallos"}
        />
        <Kpi
          label="Tasa entrega"
          value={deliveryRate !== null ? `${deliveryRate}%` : "—"}
          tip="Mensajes entregados / intentados"
        />
        <Kpi
          label="Latencia prom."
          value={avgLatencyMs !== null ? `${(avgLatencyMs / 1000).toFixed(1)}s` : "—"}
          tip="Tiempo de respuesta del agente"
        />
        <Kpi
          label="Tokens totales"
          value={fmtTokens(totalTokens)}
          sub={`In: ${fmtTokens(totalInputTokens)} · Out: ${fmtTokens(totalOutputTokens)}`}
          tip={totalCacheReadTokens > 0 ? `Cache hit: ${fmtTokens(totalCacheReadTokens)}` : undefined}
        />
      </div>

      {/* Row 3: Leads & conversions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Leads calificados"
          value={leadsQualified}
          sub={uniqueLeads > 0 ? `${Math.round(leadsQualified / uniqueLeads * 100)}% de leads únicos` : undefined}
          tip="Leads con evaluación ≠ no calificado creada en el período"
        />
        <Kpi
          label="Datos completados"
          value={dataCompleted}
          tip="Leads con nombre + teléfono + email registrados"
        />
        <Kpi
          label="Ventas atribuidas"
          value={salesAttributed}
          tip="Ventas confirmadas en 7 días desde inicio del episodio · Correlación, no causalidad"
        />
        <Kpi
          label="1ª resp. humana"
          value={firstHumanResponseMs !== null
            ? firstHumanResponseMs < 60_000
              ? `${Math.round(firstHumanResponseMs / 1000)}s`
              : `${Math.round(firstHumanResponseMs / 60_000)}min`
            : "—"}
          tip={firstHumanResponseMs !== null
            ? "Tiempo promedio desde inicio del episodio hasta primer mensaje de operador humano"
            : "Sin respuestas humanas en el período"}
        />
      </div>

      {/* Row 4: Cost */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Costo total"
          value={totalCostMillicents !== null ? formatMillicentsAsUsd(totalCostMillicents) : "N/D"}
          tip={totalCostMillicents === null ? "Sin datos de precio para este período" : "Solo registros de producción"}
        />
        <Kpi
          label="Costo por episodio"
          value={avgCostPerEpisodeMillicents !== null ? formatMillicentsAsUsd(avgCostPerEpisodeMillicents) : "—"}
          tip={episodesEnded === 0 ? "Sin episodios finalizados" : undefined}
        />
        <Kpi
          label="Costo / lead calificado"
          value={costPerQualifiedLeadMillicents !== null ? formatMillicentsAsUsd(costPerQualifiedLeadMillicents) : "—"}
          tip={leadsQualified === 0 ? "Sin leads calificados en el período" : "Costo total / leads calificados"}
        />
        <Kpi
          label="Costo WhatsApp"
          value="N/D"
          tip="Se mostrará cuando haya datos verificados del proveedor"
        />
      </div>
    </div>
  )
}

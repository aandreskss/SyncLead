"use client"

import { useState, useTransition, useCallback } from "react"
import { getEpisodeSummaryAction, listConversationsAction } from "@/domains/ai-agents/analytics-actions"
import type { EpisodeSummary, ConversationRow } from "@/domains/ai-agents/analytics-repository"
import { UsageSummaryCards } from "./UsageSummaryCards"
import { EpisodesTable } from "./EpisodesTable"
import { BudgetStatusBar } from "./BudgetStatusBar"

interface Props {
  agents: { id: string; name: string }[]
  phoneNumbers: { id: string; displayPhoneNumber: string }[]
}

function todayRange(): { from: Date; to: Date } {
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29))
  return { from, to: now }
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function AnalyticsDashboard({ agents, phoneNumbers }: Props) {
  const range = todayRange()

  const [from, setFrom] = useState(toInputDate(range.from))
  const [to, setTo] = useState(toInputDate(range.to))
  const [agentId, setAgentId] = useState("")
  const [phoneNumberId, setPhoneNumberId] = useState("")

  const [summary, setSummary] = useState<EpisodeSummary | null>(null)
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [loaded, setLoaded] = useState(false)

  const load = useCallback((p = 1) => {
    startTransition(async () => {
      setError(null)
      const filters = {
        from: new Date(from + "T00:00:00Z"),
        to: new Date(to + "T23:59:59Z"),
        ...(agentId ? { agentId } : {}),
        ...(phoneNumberId ? { phoneNumberId } : {}),
        page: p,
        pageSize: 50,
      }

      const [sumRes, listRes] = await Promise.all([
        getEpisodeSummaryAction(filters),
        listConversationsAction(filters),
      ])

      if (!sumRes.success) { setError(sumRes.error); return }
      if (!listRes.success) { setError(listRes.error); return }

      setSummary(sumRes.summary)
      setConversations(listRes.rows)
      setTotal(listRes.total)
      setPage(p)
      setLoaded(true)
    })
  }, [from, to, agentId])

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-ops-line bg-ops-s1 px-5 py-4 shadow-ops-card">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-ops-tx3">Desde</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="rounded-lg border border-ops-bd bg-ops-bg px-3 py-1.5 text-sm text-ops-tx focus:border-ops-blue focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-ops-tx3">Hasta</label>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="rounded-lg border border-ops-bd bg-ops-bg px-3 py-1.5 text-sm text-ops-tx focus:border-ops-blue focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-ops-tx3">Agente</label>
          <select
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            className="rounded-lg border border-ops-bd bg-ops-bg px-3 py-1.5 text-sm text-ops-tx focus:border-ops-blue focus:outline-none"
          >
            <option value="">Todos los agentes</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        {phoneNumbers.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ops-tx3">Número</label>
            <select
              value={phoneNumberId}
              onChange={e => setPhoneNumberId(e.target.value)}
              className="rounded-lg border border-ops-bd bg-ops-bg px-3 py-1.5 text-sm text-ops-tx focus:border-ops-blue focus:outline-none"
            >
              <option value="">Todos los números</option>
              {phoneNumbers.map(p => (
                <option key={p.id} value={p.id}>{p.displayPhoneNumber}</option>
              ))}
            </select>
          </div>
        )}
        <button
          type="button"
          onClick={() => load(1)}
          disabled={isPending}
          className="h-[34px] rounded-lg bg-ops-blue px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Cargando…" : "Aplicar"}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Budget status */}
      <BudgetStatusBar />

      {/* KPI cards */}
      {loaded && summary && <UsageSummaryCards summary={summary} />}

      {/* Conversation table */}
      {loaded && (
        <EpisodesTable
          rows={conversations}
          total={total}
          page={page}
          pageSize={50}
          onPage={load}
          loading={isPending}
        />
      )}

      {!loaded && !isPending && (
        <div className="rounded-2xl border border-ops-line bg-ops-s1 px-6 py-12 text-center shadow-ops-card">
          <p className="text-sm text-ops-tx3">Selecciona un rango de fechas y presiona Aplicar para ver los datos.</p>
        </div>
      )}
    </div>
  )
}

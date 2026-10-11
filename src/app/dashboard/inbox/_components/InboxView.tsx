"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { getInboxAction } from "@/domains/ai-agents/inbox-actions"
import type { InboxConversation, InboxFilter } from "@/domains/ai-agents/inbox-repository"
import ConversationCard from "./ConversationCard"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "waiting_human", label: "Esperando" },
  { value: "mine", label: "Mis conv." },
  { value: "unassigned", label: "Sin asignar" },
  { value: "ai_active", label: "IA activa" },
  { value: "closed", label: "Cerradas" },
]

const POLL_INTERVALS = [5_000, 10_000, 20_000, 30_000] // backoff steps
const POLL_MAX_IDLE = 60_000

interface Props {
  initialConversations: InboxConversation[]
  initialFilter: InboxFilter
  userId: string
}

export default function InboxView({ initialConversations, initialFilter, userId }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [filter, setFilter] = useState<InboxFilter>(initialFilter)
  const [conversations, setConversations] = useState(initialConversations)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollIdxRef = useRef(0)
  const lastActivityRef = useRef(Date.now())

  const fetchConversations = useCallback(async (f: InboxFilter, p: number) => {
    const result = await getInboxAction(f, p)
    if (result.success) {
      setConversations(result.conversations)
    }
  }, [])

  // Polling with backoff
  const schedulePoll = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    const idle = Date.now() - lastActivityRef.current
    if (idle >= POLL_MAX_IDLE) {
      pollIdxRef.current = Math.min(pollIdxRef.current + 1, POLL_INTERVALS.length - 1)
    } else {
      pollIdxRef.current = 0
    }
    const delay = POLL_INTERVALS[pollIdxRef.current]!
    pollTimerRef.current = setTimeout(async () => {
      await fetchConversations(filter, page)
      schedulePoll()
    }, delay)
  }, [filter, page, fetchConversations])

  useEffect(() => {
    schedulePoll()
    return () => { if (pollTimerRef.current) clearTimeout(pollTimerRef.current) }
  }, [schedulePoll])

  async function changeFilter(f: InboxFilter) {
    lastActivityRef.current = Date.now()
    pollIdxRef.current = 0
    setFilter(f)
    setPage(1)
    setLoading(true)
    const params = new URLSearchParams(searchParams.toString())
    params.set("filter", f)
    params.delete("page")
    router.push(`${pathname}?${params.toString()}`)
    await fetchConversations(f, 1)
    setLoading(false)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex w-72 shrink-0 flex-col border-r border-ops-line">
        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-ops-line p-3">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => changeFilter(f.value)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                filter === f.value
                  ? "bg-ops-blue text-white"
                  : "text-ops-tx2 hover:bg-ops-s2 hover:text-ops-tx"
              )}
              aria-pressed={filter === f.value}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto" role="list" aria-label="Conversaciones">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-ops-tx3" aria-label="Cargando" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-ops-tx2">Sin conversaciones</p>
              <p className="mt-1 text-xs text-ops-tx3">Cambia el filtro o espera nuevas conversaciones.</p>
            </div>
          ) : (
            conversations.map(conv => (
              <div key={conv.id} role="listitem">
                <ConversationCard conv={conv} />
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {conversations.length >= 30 && (
          <div className="flex items-center justify-center gap-3 border-t border-ops-line p-3">
            <button
              disabled={page === 1}
              onClick={async () => {
                const next = page - 1
                setPage(next)
                await fetchConversations(filter, next)
              }}
              className="text-xs text-ops-blue disabled:text-ops-tx3"
              aria-label="Página anterior"
            >
              ← Anterior
            </button>
            <span className="text-xs text-ops-tx3">Pág. {page}</span>
            <button
              onClick={async () => {
                const next = page + 1
                setPage(next)
                await fetchConversations(filter, next)
              }}
              className="text-xs text-ops-blue"
              aria-label="Página siguiente"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {/* Placeholder for conversation slot (populated by [conversationId] route) */}
      <div className="hidden flex-1 items-center justify-center md:flex">
        <p className="text-sm text-ops-tx3">Selecciona una conversación para verla.</p>
      </div>
    </div>
  )
}

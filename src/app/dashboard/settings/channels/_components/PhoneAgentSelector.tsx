"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { assignAgentToPhoneAction } from "@/domains/ai-agents/actions"
import { Bot, ChevronDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Agent {
  id: string
  name: string
}

interface Props {
  phoneNumberId: string
  currentAgentId: string | null
  agents: Agent[]
}

export function PhoneAgentSelector({ phoneNumberId, currentAgentId, agents }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedAgentId, setSelectedAgentId] = useState<string>(currentAgentId ?? "")
  const [error, setError] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newAgentId = e.target.value || null
    setSelectedAgentId(e.target.value)
    setError(null)

    startTransition(async () => {
      try {
        const res = await assignAgentToPhoneAction(phoneNumberId, newAgentId)
        if (!res.success) {
          setError("error" in res ? res.error ?? "Error al asignar" : "Error al asignar")
          setSelectedAgentId(currentAgentId ?? "")
        } else {
          router.refresh()
        }
      } catch {
        setError("Error al guardar")
        setSelectedAgentId(currentAgentId ?? "")
      }
    })
  }

  return (
    <div className="mt-2 ml-6">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Bot className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ops-tx3" />
          <select
            value={selectedAgentId}
            onChange={handleChange}
            disabled={isPending}
            className={cn(
              "w-full appearance-none rounded-lg border border-ops-bd bg-white pl-7 pr-7 py-1.5 text-xs text-ops-tx",
              "focus:outline-none focus:ring-2 focus:ring-ops-blue/30 focus:border-ops-blue",
              "disabled:opacity-60 disabled:cursor-not-allowed",
            )}
          >
            <option value="">Sin agente asignado</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-ops-tx3" />
        </div>
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-ops-tx3" />}
      </div>
      {error && <p className="mt-1 text-xs text-ops-coral">{error}</p>}
    </div>
  )
}

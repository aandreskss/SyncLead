"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  takeConversationAction,
  releaseConversationAction,
  returnToAiAction,
  resolveAction,
  reopenAction,
} from "@/domains/ai-agents/inbox-actions"
import type { ConversationDetail } from "@/domains/ai-agents/inbox-repository"
import { Bot, UserCheck, UserMinus, CheckCircle2, RefreshCw, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  detail: ConversationDetail
  currentUserId: string
  userRole: string
}

type ActionResult = { success: boolean; error?: string }

const CAN_MANAGE = ["owner", "admin", "manager", "agent"]

export default function ActionBar({ detail, currentUserId, userRole }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const { conversation } = detail
  const canManage = CAN_MANAGE.includes(userRole)
  const isMine = conversation.assignedTo === currentUserId
  const isClosed = conversation.status === "closed"
  const isHuman = conversation.controlMode === "human"
  const isAi = conversation.controlMode === "ai"

  function act(fn: () => Promise<ActionResult>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success && res.error) {
        setError(res.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="rounded-lg border border-ops-red-bd bg-ops-red-bg px-3 py-2 text-xs text-ops-red">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Take */}
        {!isClosed && !isHuman && canManage && (
          <ActionButton
            icon={<UserCheck className="h-3.5 w-3.5" />}
            label="Tomar conversación"
            disabled={isPending}
            onClick={() => act(() => takeConversationAction(conversation.id))}
            variant="primary"
          />
        )}

        {/* Release */}
        {!isClosed && isHuman && isMine && canManage && (
          <ActionButton
            icon={<UserMinus className="h-3.5 w-3.5" />}
            label="Liberar"
            disabled={isPending}
            onClick={() => act(() => releaseConversationAction(conversation.id))}
            variant="secondary"
          />
        )}

        {/* Return to AI */}
        {!isClosed && isHuman && canManage && (
          <ActionButton
            icon={<Bot className="h-3.5 w-3.5" />}
            label="Devolver a IA"
            disabled={isPending}
            onClick={() => act(() => returnToAiAction({ conversationId: conversation.id }))}
            variant="secondary"
          />
        )}

        {/* Resolve */}
        {!isClosed && canManage && (
          <ActionButton
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label="Resolver"
            disabled={isPending}
            onClick={() => act(() => resolveAction(conversation.id))}
            variant="secondary"
          />
        )}

        {/* Reopen */}
        {isClosed && canManage && (
          <ActionButton
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            label="Reabrir"
            disabled={isPending}
            onClick={() => act(() => reopenAction(conversation.id))}
            variant="secondary"
          />
        )}

        {isPending && (
          <Loader2 className="h-4 w-4 animate-spin self-center text-ops-tx3" aria-label="Procesando" />
        )}
      </div>
    </div>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  variant,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  variant: "primary" | "secondary"
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
        variant === "primary"
          ? "bg-ops-blue text-white hover:bg-ops-blue-d"
          : "border border-ops-bd bg-ops-bg text-ops-tx hover:bg-ops-s2"
      )}
    >
      {icon}
      {label}
    </button>
  )
}

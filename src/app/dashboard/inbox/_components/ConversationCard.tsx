"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import type { InboxConversation } from "@/domains/ai-agents/inbox-repository"
import { Bot, User, Clock, Phone } from "lucide-react"

const CONTROL_MODE_LABEL: Record<string, string> = {
  ai: "IA activa",
  human: "Humano",
  waiting_human: "Esperando",
  paused: "Pausado",
}

const CONTROL_MODE_COLOR: Record<string, string> = {
  ai: "bg-ops-blue-bg text-ops-blue",
  human: "bg-ops-green-bg text-ops-green",
  waiting_human: "bg-ops-amber-bg text-amber-700",
  paused: "bg-ops-s2 text-ops-tx3",
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return "ahora"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export default function ConversationCard({ conv, active }: { conv: InboxConversation; active?: boolean }) {
  const modeLabel = CONTROL_MODE_LABEL[conv.controlMode] ?? conv.controlMode
  const modeColor = CONTROL_MODE_COLOR[conv.controlMode] ?? "bg-ops-s2 text-ops-tx3"

  return (
    <Link
      href={`/dashboard/inbox/${conv.id}`}
      className={cn(
        "block border-b border-ops-line px-4 py-3 transition-colors hover:bg-ops-s2",
        active && "bg-ops-blue-bg",
      )}
      aria-current={active ? "page" : undefined}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ops-s2">
          <Phone className="h-4 w-4 text-ops-tx3" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-ops-tx">
              {conv.customerName ?? conv.customerPhone}
            </p>
            <span className="shrink-0 text-[11px] text-ops-tx3">
              {timeAgo(conv.lastMessageAt)}
            </span>
          </div>

          {conv.lastMessage && (
            <p className="mt-0.5 truncate text-xs text-ops-tx2">{conv.lastMessage}</p>
          )}

          <div className="mt-1.5 flex items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", modeColor)}>
              {modeLabel}
            </span>
            {conv.controlMode === "ai" && (
              <Bot className="h-3 w-3 text-ops-blue" aria-hidden="true" />
            )}
            {conv.assignedUserName && (
              <span className="flex items-center gap-0.5 text-[11px] text-ops-tx3">
                <User className="h-3 w-3" aria-hidden="true" />
                {conv.assignedUserName}
              </span>
            )}
            {conv.messageCount > 0 && (
              <span className="flex items-center gap-0.5 text-[11px] text-ops-tx3">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {conv.messageCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

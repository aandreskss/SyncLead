"use client"

import { cn } from "@/lib/utils"
import type { WaConversationMessage } from "@/lib/db/schema"
import { Bot, User } from "lucide-react"

const STATUS_SYMBOL: Record<string, string> = {
  sent: "✓",
  delivered: "✓✓",
  read: "✓✓",
  failed: "✗",
}

export default function MessageList({
  messages,
}: {
  messages: WaConversationMessage[]
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {messages.map(msg => {
        const isOutbound = msg.direction === "outbound"
        const isAi = msg.isAi

        return (
          <div
            key={msg.id}
            className={cn("flex gap-2", isOutbound ? "flex-row-reverse" : "flex-row")}
          >
            {/* Avatar */}
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px]",
                isOutbound
                  ? isAi
                    ? "bg-ops-blue-bg text-ops-blue"
                    : "bg-ops-green-bg text-ops-green"
                  : "bg-ops-s2 text-ops-tx3"
              )}
              aria-hidden="true"
            >
              {isOutbound ? (isAi ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />) : "C"}
            </div>

            {/* Bubble */}
            <div
              className={cn(
                "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                isOutbound
                  ? isAi
                    ? "bg-ops-blue text-white"
                    : "bg-ops-green-bg text-ops-green-dark border border-ops-green-bd"
                  : "bg-ops-s2 text-ops-tx"
              )}
            >
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              <div
                className={cn(
                  "mt-0.5 flex items-center gap-1 text-[10px]",
                  isOutbound ? "justify-end" : "justify-start",
                  isOutbound ? (isAi ? "text-blue-200" : "text-ops-green/70") : "text-ops-tx3"
                )}
              >
                <time dateTime={msg.createdAt.toISOString()}>
                  {msg.createdAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                </time>
                {isOutbound && (
                  <span
                    aria-label={`Estado: ${msg.status}`}
                    className={msg.status === "read" ? "text-blue-300" : ""}
                  >
                    {STATUS_SYMBOL[msg.status] ?? ""}
                  </span>
                )}
                {isAi && isOutbound && <span className="opacity-70">(IA)</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

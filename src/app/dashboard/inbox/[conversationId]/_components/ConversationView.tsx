"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import type { ConversationDetail } from "@/domains/ai-agents/inbox-repository"
import MessageList from "./MessageList"
import ReplyBox from "./ReplyBox"
import ActionBar from "./ActionBar"
import LeadPanel from "./LeadPanel"
import NotesPanel from "./NotesPanel"
import { Bot, User, ChevronLeft } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

const CONTROL_MODE_LABEL: Record<string, string> = {
  ai: "IA activa",
  human: "Humano en control",
  waiting_human: "Esperando humano",
  paused: "Pausado",
}

const CONTROL_MODE_COLOR: Record<string, string> = {
  ai: "bg-ops-blue-bg text-ops-blue",
  human: "bg-ops-green-bg text-ops-green",
  waiting_human: "bg-ops-amber-bg text-amber-700",
  paused: "bg-ops-s2 text-ops-tx3",
}

const POLL_INTERVAL = 10_000

interface Props {
  detail: ConversationDetail
  currentUserId: string
  userRole: string
}

export default function ConversationView({ detail, currentUserId, userRole }: Props) {
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)
  const { conversation } = detail

  // Poll for new messages
  useEffect(() => {
    const timer = setInterval(() => { router.refresh() }, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [router])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [detail.messages.length])

  const modeLabel = CONTROL_MODE_LABEL[conversation.controlMode] ?? conversation.controlMode
  const modeColor = CONTROL_MODE_COLOR[conversation.controlMode] ?? "bg-ops-s2 text-ops-tx3"

  return (
    <div className="flex h-full">
      {/* Main conversation area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-ops-line px-4 py-3">
          <Link
            href="/dashboard/inbox"
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-ops-s2 md:hidden"
            aria-label="Volver a bandeja"
          >
            <ChevronLeft className="h-4 w-4 text-ops-tx2" aria-hidden="true" />
          </Link>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ops-tx">
              {conversation.customerName ?? conversation.customerPhone}
            </p>
            <p className="text-xs text-ops-tx3">{conversation.customerPhone}</p>
          </div>

          <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", modeColor)}>
            {modeLabel}
          </span>

          {conversation.controlMode === "ai" && (
            <Bot className="h-4 w-4 text-ops-blue" aria-hidden="true" />
          )}
          {conversation.controlMode === "human" && (
            <User className="h-4 w-4 text-ops-green" aria-hidden="true" />
          )}
        </div>

        {/* Action bar */}
        <div className="border-b border-ops-line px-4 py-2">
          <ActionBar detail={detail} currentUserId={currentUserId} userRole={userRole} />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto" role="log" aria-label="Mensajes de conversación" aria-live="polite">
          <MessageList messages={detail.messages} />
          <div ref={bottomRef} />
        </div>

        {/* Reply box */}
        <ReplyBox
          conversationId={conversation.id}
          controlMode={conversation.controlMode}
          status={conversation.status}
          onMessageSent={() => router.refresh()}
        />
      </div>

      {/* Side panel (lead info + notes) */}
      <div className="hidden w-72 shrink-0 overflow-y-auto border-l border-ops-line lg:flex lg:flex-col">
        <LeadPanel detail={detail} />
        <div className="border-t border-ops-line">
          <NotesPanel detail={detail} />
        </div>
      </div>
    </div>
  )
}

"use client"

import { useState, useRef } from "react"
import { replyAction } from "@/domains/ai-agents/inbox-actions"
import { SendHorizonal, Loader2, AlertCircle } from "lucide-react"

interface Props {
  conversationId: string
  controlMode: string
  status: string
  onMessageSent?: () => void
}

export default function ReplyBox({ conversationId, controlMode, status, onMessageSent }: Props) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requiresTemplate, setRequiresTemplate] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canReply = controlMode === "human" && status !== "closed"

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    setRequiresTemplate(false)

    const result = await replyAction({ conversationId, text: trimmed })

    if (result.success) {
      setText("")
      textareaRef.current?.focus()
      onMessageSent?.()
    } else {
      setError(result.error)
      if ("requiresTemplate" in result && result.requiresTemplate) {
        setRequiresTemplate(true)
      }
    }
    setSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  if (!canReply) {
    return (
      <div className="border-t border-ops-line bg-ops-s2 px-4 py-3">
        <p className="text-center text-xs text-ops-tx3">
          {status === "closed"
            ? "Conversación cerrada. Reabre para responder."
            : "Toma la conversación para poder responder."}
        </p>
      </div>
    )
  }

  return (
    <div className="border-t border-ops-line bg-ops-bg p-3">
      {error && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-ops-red-bd bg-ops-red-bg px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-ops-red" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs text-ops-red">{error}</p>
            {requiresTemplate && (
              <p className="mt-0.5 text-xs text-ops-tx3">
                Para continuar la conversación usa una plantilla aprobada por Meta.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje… (Enter para enviar, Shift+Enter para nueva línea)"
          disabled={sending}
          rows={1}
          className="min-h-[40px] flex-1 resize-none rounded-xl border border-ops-bd bg-ops-s2 px-3 py-2 text-sm text-ops-tx placeholder-ops-tx3 focus:border-ops-blue focus:outline-none disabled:opacity-50"
          aria-label="Mensaje de respuesta"
          style={{ maxHeight: "120px" }}
        />
        <button
          onClick={() => void handleSend()}
          disabled={!text.trim() || sending}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ops-blue text-white transition-opacity disabled:opacity-40"
          aria-label="Enviar mensaje"
        >
          {sending
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <SendHorizonal className="h-4 w-4" aria-hidden="true" />
          }
        </button>
      </div>
    </div>
  )
}

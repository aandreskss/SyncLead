"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { addNoteAction } from "@/domains/ai-agents/inbox-actions"
import type { ConversationDetail } from "@/domains/ai-agents/inbox-repository"
import { Lock, Plus, Loader2 } from "lucide-react"

export default function NotesPanel({ detail }: { detail: ConversationDetail }) {
  const router = useRouter()
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { conversation, notes } = detail

  async function handleAdd() {
    const trimmed = body.trim()
    if (!trimmed || saving) return
    setSaving(true)
    setError(null)
    const result = await addNoteAction({ conversationId: conversation.id, body: trimmed })
    if (result.success) {
      setBody("")
      router.refresh()
    } else {
      setError(result.error)
    }
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5 text-ops-tx3" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wide text-ops-tx3">
          Notas internas
        </p>
      </div>

      <p className="text-[11px] text-ops-tx3">
        Solo visible para tu equipo. Nunca se muestran al contacto.
      </p>

      {/* Existing notes */}
      <div className="space-y-2">
        {notes.length === 0 ? (
          <p className="text-xs text-ops-tx3">Sin notas aún.</p>
        ) : (
          notes.map(note => (
            <div key={note.id} className="rounded-xl border border-ops-bd bg-ops-s2 px-3 py-2">
              <p className="text-xs text-ops-tx">{note.body}</p>
              <p className="mt-1 text-[10px] text-ops-tx3">
                {note.authorName ?? note.authorId} ·{" "}
                {note.createdAt.toLocaleString("es-ES", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Add note */}
      {error && (
        <p className="text-xs text-ops-red">{error}</p>
      )}
      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Añadir nota interna…"
          rows={2}
          disabled={saving}
          className="flex-1 resize-none rounded-xl border border-ops-bd bg-ops-bg px-3 py-2 text-xs text-ops-tx placeholder-ops-tx3 focus:border-ops-blue focus:outline-none disabled:opacity-50"
          aria-label="Nueva nota interna"
        />
        <button
          onClick={() => void handleAdd()}
          disabled={!body.trim() || saving}
          className="self-end flex h-8 w-8 items-center justify-center rounded-xl bg-ops-blue text-white disabled:opacity-40"
          aria-label="Guardar nota"
        >
          {saving
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            : <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          }
        </button>
      </div>
    </div>
  )
}

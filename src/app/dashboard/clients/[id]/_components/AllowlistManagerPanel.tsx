"use client"

import { useState, useTransition } from "react"
import { ShieldCheck, Plus, Trash2, Loader2, CheckCircle2, AlertTriangle } from "lucide-react"
import { addToAllowlistAction, removeFromAllowlistAction } from "@/domains/meta-insights/actions"
import type { AllowlistEntry } from "@/domains/meta-insights/types"

interface Props {
  initialEntries: AllowlistEntry[]
}

export function AllowlistManagerPanel({ initialEntries }: Props) {
  const [entries, setEntries] = useState(initialEntries)
  const [input, setInput] = useState("")
  const [notes, setNotes] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  function handleAdd() {
    setError(null)
    start(async () => {
      const res = await addToAllowlistAction({ adAccountId: input.trim(), notes: notes.trim() || undefined })
      if (res.success) {
        const normalized = input.trim().startsWith("act_") ? input.trim() : `act_${input.trim()}`
        setEntries((prev) => {
          const exists = prev.find((e) => e.adAccountId === normalized)
          if (exists) return prev.map((e) => e.adAccountId === normalized ? { ...e, active: true } : e)
          return [{ id: Date.now().toString(), adAccountId: normalized, notes: notes.trim() || null, active: true, createdAt: new Date() }, ...prev]
        })
        setInput("")
        setNotes("")
        setShowForm(false)
      } else {
        setError(res.error ?? "Error al autorizar")
      }
    })
  }

  function handleRemove(adAccountId: string) {
    start(async () => {
      const res = await removeFromAllowlistAction(adAccountId)
      if (res.success) {
        setEntries((prev) => prev.filter((e) => e.adAccountId !== adAccountId))
      }
      setConfirmRemove(null)
    })
  }

  const activeEntries = entries.filter((e) => e.active)

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-ops-tx2" />
          <h2 className="text-sm font-semibold text-ops-tx">Cuentas autorizadas (beta)</h2>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs text-ops-tx2 hover:text-ops-tx border border-ops-bd px-2.5 py-1 rounded-lg transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Autorizar cuenta
          </button>
        )}
      </div>

      <p className="text-xs text-ops-tx3">
        Agrega el ID de tu cuenta publicitaria de Meta para habilitar la sincronización de Insights.
        Solo owners y admins pueden gestionar esta lista.
      </p>

      {/* Add form */}
      {showForm && (
        <div className="space-y-3 rounded-lg border border-ops-bd bg-ops-s2/40 p-4">
          <div>
            <label className="text-xs text-ops-tx2">Ad Account ID</label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="act_12345678 o 12345678"
              className="mt-1 w-full rounded-lg border border-ops-bd bg-ops-s1 px-3 py-2 text-sm text-ops-tx placeholder:text-ops-tx3 focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-ops-tx2">Nota (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Cuenta de producción Savaya"
              className="mt-1 w-full rounded-lg border border-ops-bd bg-ops-s1 px-3 py-2 text-sm text-ops-tx placeholder:text-ops-tx3 focus:border-zinc-500 focus:outline-none"
            />
          </div>
          {error && <p className="text-xs text-ops-coral">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={isPending || !input.trim()}
              className="flex items-center gap-1.5 text-xs bg-ops-blue hover:bg-ops-blue/80 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Autorizar
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null) }}
              className="text-xs text-ops-tx3 hover:text-ops-tx2 px-3 py-1.5 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Allowlist entries */}
      {activeEntries.length > 0 ? (
        <div className="space-y-2">
          {activeEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-lg border border-ops-bd/60 bg-ops-s2/30 px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-ops-green shrink-0" />
                <div>
                  <p className="text-xs font-mono text-ops-tx">{entry.adAccountId}</p>
                  {entry.notes && <p className="text-[10px] text-ops-tx3">{entry.notes}</p>}
                </div>
              </div>
              {confirmRemove === entry.adAccountId ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-ops-coral">¿Confirmar?</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(entry.adAccountId)}
                    disabled={isPending}
                    className="text-[10px] text-ops-coral hover:text-red-400 font-medium"
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(null)}
                    className="text-[10px] text-ops-tx3 hover:text-ops-tx2"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(entry.adAccountId)}
                  className="text-ops-tx3 hover:text-ops-coral transition-colors"
                  title="Desautorizar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        !showForm && (
          <div className="flex items-center gap-2 rounded-lg border border-ops-bd/60 bg-ops-s2/30 px-3 py-3">
            <AlertTriangle className="h-3.5 w-3.5 text-ops-amber shrink-0" />
            <p className="text-xs text-ops-tx3">
              Ninguna cuenta autorizada. Agrega tu Ad Account ID para poder conectar Insights.
            </p>
          </div>
        )
      )}
    </section>
  )
}

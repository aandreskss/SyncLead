"use client"

import { useState, useTransition } from "react"
import { Users, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, X, Check } from "lucide-react"
import {
  createSalesRepAction,
  updateSalesRepAction,
  toggleSalesRepActiveAction,
  deleteSalesRepAction,
} from "@/domains/team/actions"
import type { SalesRep } from "@/lib/db/schema"

interface Props {
  clientId: string
  initialReps: SalesRep[]
}

interface RepForm {
  displayName: string
  email: string
  whatsappNumber: string
}

const EMPTY_FORM: RepForm = { displayName: "", email: "", whatsappNumber: "" }

export function SalesTeamPanel({ clientId, initialReps }: Props) {
  const [reps, setReps] = useState<SalesRep[]>(initialReps)
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<RepForm>(EMPTY_FORM)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  function openCreate() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowCreate(true)
  }

  function openEdit(rep: SalesRep) {
    setShowCreate(false)
    setEditId(rep.id)
    setForm({
      displayName: rep.displayName,
      email: rep.email ?? "",
      whatsappNumber: rep.whatsappNumber ?? "",
    })
    setError(null)
  }

  function handleSubmit() {
    setError(null)
    start(async () => {
      const payload = {
        displayName: form.displayName.trim(),
        email: form.email.trim() || null,
        whatsappNumber: form.whatsappNumber.trim() || null,
      }
      if (editId) {
        const result = await updateSalesRepAction(editId, payload)
        if (result && "error" in result) { setError(result.error ?? null); return }
        setReps((prev) => prev.map((r) => (r.id === editId ? { ...r, ...payload } : r)))
        setEditId(null)
      } else {
        const result = await createSalesRepAction({ ...payload, clientId })
        if (result && "error" in result) { setError(result.error ?? null); return }
        if (result?.data) setReps((prev) => [...prev, result.data])
        setShowCreate(false)
        setForm(EMPTY_FORM)
      }
    })
  }

  function handleToggleActive(repId: string) {
    start(async () => {
      const result = await toggleSalesRepActiveAction(repId)
      if (result?.data) setReps((prev) => prev.map((r) => (r.id === repId ? { ...r, active: result.data!.active! } : r)))
    })
  }

  function handleDelete(repId: string) {
    start(async () => {
      const result = await deleteSalesRepAction(repId)
      if (result && "error" in result) { setError(result.error ?? null); setConfirmDeleteId(null); return }
      setReps((prev) => prev.filter((r) => r.id !== repId))
      setConfirmDeleteId(null)
    })
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-200">Equipo comercial</h2>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar vendedor
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <RepForm
          form={form}
          onChange={setForm}
          onSubmit={handleSubmit}
          onCancel={() => setShowCreate(false)}
          isPending={isPending}
          error={error}
          title="Nuevo vendedor"
        />
      )}

      {/* List */}
      {reps.length === 0 && !showCreate && (
        <p className="text-sm text-zinc-500 text-center py-6">No hay vendedores. Agrega el primero.</p>
      )}

      <div className="space-y-2">
        {reps.map((rep) => (
          <div key={rep.id} className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
            {editId === rep.id ? (
              <RepForm
                form={form}
                onChange={setForm}
                onSubmit={handleSubmit}
                onCancel={() => setEditId(null)}
                isPending={isPending}
                error={error}
                title="Editar vendedor"
              />
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-100 truncate">{rep.displayName}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      rep.active ? "bg-emerald-400/10 text-emerald-400" : "bg-zinc-700/60 text-zinc-500"
                    }`}>
                      {rep.active ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  {rep.whatsappNumber && (
                    <p className="text-xs text-zinc-500 mt-0.5">{rep.whatsappNumber}</p>
                  )}
                  {rep.email && (
                    <p className="text-xs text-zinc-600 truncate">{rep.email}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleToggleActive(rep.id)}
                    title={rep.active ? "Desactivar" : "Activar"}
                    className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {rep.active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => openEdit(rep)}
                    className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {confirmDeleteId === rep.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(rep.id)}
                        disabled={isPending}
                        className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(rep.id)}
                      className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Internal form component ─────────────────────────────────────────────────

function RepForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  isPending,
  error,
  title,
}: {
  form: RepForm
  onChange: (f: RepForm) => void
  onSubmit: () => void
  onCancel: () => void
  isPending: boolean
  error: string | null
  title: string
}) {
  return (
    <div className="rounded-xl border border-zinc-600 bg-zinc-900 p-4 space-y-3">
      <p className="text-xs font-semibold text-zinc-300">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-400">Nombre *</label>
          <input
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            placeholder="Nombre completo"
            value={form.displayName}
            onChange={(e) => onChange({ ...form, displayName: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400">WhatsApp (E.164)</label>
          <input
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            placeholder="+58414…"
            value={form.whatsappNumber}
            onChange={(e) => onChange({ ...form, whatsappNumber: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-zinc-400">Email</label>
          <input
            type="email"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            placeholder="vendedor@ejemplo.com"
            value={form.email}
            onChange={(e) => onChange({ ...form, email: e.target.value })}
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={onSubmit}
          disabled={isPending || !form.displayName.trim()}
          className="flex items-center gap-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-100 px-4 py-2 rounded-lg transition-colors"
        >
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Guardar
        </button>
        <button
          onClick={onCancel}
          className="text-sm text-zinc-500 hover:text-zinc-300 px-4 py-2 rounded-lg transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

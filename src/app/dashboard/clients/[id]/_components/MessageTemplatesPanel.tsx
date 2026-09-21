"use client"

import { useState, useTransition } from "react"
import { FileText, Plus, Pencil, Loader2, X } from "lucide-react"
import {
  createMessageTemplateAction,
  updateMessageTemplateAction,
} from "@/domains/whatsapp/actions"
import type { MessageTemplate } from "@/lib/db/schema"
import { interpolateTemplate } from "@/domains/whatsapp/repository"

interface Props {
  clientId: string
  initialTemplates: MessageTemplate[]
}

interface TmplForm {
  name: string
  content: string
  allowedVariables: string
  isDefault: boolean
}

const EMPTY_FORM: TmplForm = { name: "", content: "", allowedVariables: "nombre,telefono", isDefault: false }

const PREVIEW_VARS: Record<string, string> = {
  nombre: "Ana García",
  telefono: "+58414000000",
  producto: "Producto A",
  precio: "$100",
}

export function MessageTemplatesPanel({ clientId, initialTemplates }: Props) {
  const [templates, setTemplates] = useState<MessageTemplate[]>(initialTemplates)
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<TmplForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  function openCreate() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowCreate(true)
  }

  function openEdit(t: MessageTemplate) {
    setShowCreate(false)
    setEditId(t.id)
    setForm({
      name: t.name,
      content: t.content,
      allowedVariables: t.allowedVariables.join(", "),
      isDefault: t.isDefault,
    })
    setError(null)
  }

  function parseVars(raw: string): string[] {
    return raw.split(",").map((v) => v.trim()).filter(Boolean)
  }

  function handleSubmit() {
    setError(null)
    const vars = parseVars(form.allowedVariables)
    start(async () => {
      if (editId) {
        const result = await updateMessageTemplateAction(editId, {
          name: form.name.trim(),
          content: form.content.trim(),
          allowedVariables: vars,
          isDefault: form.isDefault,
        })
        if (result && "error" in result) { setError(result.error ?? null); return }
        if (result?.data) setTemplates((prev) => prev.map((t) => (t.id === editId ? result.data! : t)))
        setEditId(null)
      } else {
        const result = await createMessageTemplateAction({
          clientId,
          name: form.name.trim(),
          content: form.content.trim(),
          allowedVariables: vars,
          isDefault: form.isDefault,
        })
        if (result && "error" in result) { setError(result.error ?? null); return }
        if (result?.data) setTemplates((prev) => [...prev, result.data])
        setShowCreate(false)
        setForm(EMPTY_FORM)
      }
    })
  }

  const previewContent = form.content
    ? interpolateTemplate(form.content, parseVars(form.allowedVariables), PREVIEW_VARS)
    : ""

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-ops-tx2" />
          <h2 className="text-sm font-semibold text-ops-tx">Plantillas de mensaje</h2>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 text-xs text-ops-tx2 hover:text-ops-tx border border-ops-bd hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Nueva plantilla
        </button>
      </div>

      {(showCreate || editId) && (
        <div className="rounded-lg border border-ops-bd bg-ops-s1 p-4 space-y-3">
          <p className="text-xs font-semibold text-ops-tx2">{editId ? "Editar plantilla" : "Nueva plantilla"}</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-ops-tx2">Nombre *</label>
              <input
                className="mt-1 w-full bg-ops-s2 border border-ops-bd rounded-lg px-3 py-2 text-sm text-ops-tx placeholder-ops-tx3 focus:outline-none focus:border-zinc-500"
                placeholder="Plantilla principal"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-ops-tx2">Variables permitidas (separadas por coma)</label>
              <input
                className="mt-1 w-full bg-ops-s2 border border-ops-bd rounded-lg px-3 py-2 text-sm text-ops-tx placeholder-ops-tx3 focus:outline-none focus:border-zinc-500"
                placeholder="nombre, telefono, producto"
                value={form.allowedVariables}
                onChange={(e) => setForm((f) => ({ ...f, allowedVariables: e.target.value }))}
              />
              <p className="text-xs text-ops-tx3 mt-1">Usa {"{{variable}}"} en el contenido</p>
            </div>
            <div>
              <label className="text-xs text-ops-tx2">Contenido *</label>
              <textarea
                rows={4}
                className="mt-1 w-full bg-ops-s2 border border-ops-bd rounded-lg px-3 py-2 text-sm text-ops-tx placeholder-ops-tx3 focus:outline-none focus:border-zinc-500 resize-none"
                placeholder="Hola {{nombre}}, te contacto de…"
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              />
            </div>
            {previewContent && (
              <div className="rounded-lg bg-ops-s2 border border-ops-bd p-3">
                <p className="text-xs text-ops-tx3 mb-1">Vista previa (con datos de ejemplo)</p>
                <p className="text-sm text-ops-tx2 whitespace-pre-wrap">{previewContent}</p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                id="isDefault"
                type="checkbox"
                className="accent-emerald-500"
                checked={form.isDefault}
                onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              />
              <label htmlFor="isDefault" className="text-xs text-ops-tx2">Plantilla por defecto</label>
            </div>
          </div>
          {error && <p className="text-xs text-ops-coral">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={isPending || !form.name.trim() || !form.content.trim()}
              className="flex items-center gap-1.5 text-sm bg-ops-sel hover:bg-zinc-600 disabled:opacity-50 text-ops-tx px-4 py-2 rounded-lg transition-colors"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar
            </button>
            <button
              onClick={() => { setShowCreate(false); setEditId(null) }}
              className="text-sm text-ops-tx3 hover:text-ops-tx2 px-4 py-2 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {templates.length === 0 && !showCreate && (
        <p className="text-sm text-ops-tx3 text-center py-6">No hay plantillas. Crea la primera.</p>
      )}

      <div className="space-y-2">
        {templates.map((t) => (
          <div key={t.id} className="flex items-start justify-between gap-3 rounded-lg border border-ops-bd bg-ops-s2/50 p-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-ops-tx truncate">{t.name}</p>
                {t.isDefault && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-ops-sel text-ops-tx2">Por defecto</span>
                )}
              </div>
              <p className="text-xs text-ops-tx3 mt-0.5 truncate">{t.content.slice(0, 80)}…</p>
              {t.allowedVariables.length > 0 && (
                <p className="text-xs text-ops-tx3 mt-0.5">Variables: {t.allowedVariables.join(", ")}</p>
              )}
            </div>
            <button
              onClick={() => openEdit(t)}
              className="p-1.5 rounded-lg hover:bg-ops-sel text-ops-tx3 hover:text-ops-tx2 transition-colors flex-shrink-0"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

"use client"

import { useState, useRef } from "react"
import { Plus, Trash2, BookOpen, Upload, FileText, AlertCircle, Loader2 } from "lucide-react"
import { Panel, opsField } from "@/components/app/ops"
import type { AgentConocimientoConfig, AgentFaqItem } from "@/domains/ai-agents/types"
import { cn } from "@/lib/utils"
import { uploadDocumentSource } from "@/domains/ai-agents/documents/upload"

interface KnowledgeRow {
  id: string
  name: string
  sourceType: string
  status: string
  processingStatus?: string
  processingError?: string
}

interface Props {
  orgId: string
  config: AgentConocimientoConfig
  knowledgeSources: KnowledgeRow[]
  onChange: (v: AgentConocimientoConfig) => void
  readOnly: boolean
}

const SOURCE_TYPE_LABEL: Record<string, string> = { text: "Texto", url: "URL", file: "Archivo" }

const PROCESSING_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:    { label: "En cola",     cls: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  processing: { label: "Procesando",  cls: "bg-blue-50 text-ops-blue border-blue-200" },
  available:  { label: "Disponible",  cls: "bg-green-50 text-green-700 border-green-200" },
  error:      { label: "Error",       cls: "bg-red-50 text-red-600 border-red-200" },
}

const ALLOWED_EXTENSIONS = ".pdf,.csv,.xlsx,.xls,.txt"
const MAX_MB = 10

export default function TabConocimiento({ orgId, config, knowledgeSources, onChange, readOnly }: Props) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadedName, setUploadedName] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  function addFaq() {
    const newItem: AgentFaqItem = {
      id: Math.random().toString(36).slice(2),
      question: "",
      answer: "",
    }
    onChange({ ...config, faq: [...config.faq, newItem] })
  }

  function updateFaq(id: string, field: "question" | "answer", value: string) {
    onChange({
      ...config,
      faq: config.faq.map(item => item.id === id ? { ...item, [field]: value } : item),
    })
  }

  function removeFaq(id: string) {
    onChange({ ...config, faq: config.faq.filter(item => item.id !== id) })
  }

  function toggleSource(sourceId: string) {
    const ids = config.knowledgeSourceIds
    const next = ids.includes(sourceId)
      ? ids.filter(id => id !== sourceId)
      : [...ids, sourceId]
    onChange({ ...config, knowledgeSourceIds: next })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_MB * 1024 * 1024) {
      setUploadError(`El archivo supera el límite de ${MAX_MB} MB`)
      return
    }

    const name = uploadedName.trim() || file.name.replace(/\.[^.]+$/, "")
    setUploading(true)
    setUploadError(null)

    const formData = new FormData()
    formData.set("file", file)
    formData.set("name", name)

    const result = await uploadDocumentSource(orgId, formData)

    setUploading(false)
    if (result.ok) {
      setUploadedName("")
      if (fileInputRef.current) fileInputRef.current.value = ""
      if (result.skippedDuplicate) {
        setUploadError("Este archivo ya existe (misma huella). Usa la fuente existente.")
      }
      // Reload page so the new source appears in the list
      window.location.reload()
    } else {
      setUploadError(result.error ?? "Error desconocido al subir el archivo")
    }
  }

  return (
    <div className="space-y-4">
      {/* ── FAQs ── */}
      <Panel
        title="Preguntas frecuentes"
        description="Respuestas predefinidas que el agente usará directamente."
        actions={
          !readOnly ? (
            <button
              type="button"
              onClick={addFaq}
              className="flex items-center gap-1.5 rounded-full bg-ops-blue-bg px-3 py-1.5 text-xs font-medium text-ops-blue hover:bg-ops-blue/10"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Agregar
            </button>
          ) : undefined
        }
      >
        <div className="divide-y divide-ops-line">
          {config.faq.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-ops-tx2">Sin preguntas frecuentes aún.</p>
              {!readOnly && (
                <button
                  type="button"
                  onClick={addFaq}
                  className="mt-2 text-sm text-ops-blue hover:underline"
                >
                  Agregar la primera
                </button>
              )}
            </div>
          )}
          {config.faq.map((item, i) => (
            <div key={item.id} className="space-y-2 px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-ops-tx3">Pregunta {i + 1}</span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeFaq(item.id)}
                    className="rounded-full p-1 text-ops-tx3 hover:bg-red-50 hover:text-red-500"
                    aria-label={`Eliminar pregunta ${i + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              <input
                value={item.question}
                onChange={e => updateFaq(item.id, "question", e.target.value)}
                readOnly={readOnly}
                placeholder="¿Cuál es la pregunta que hacen los leads?"
                className={opsField}
                aria-label={`Pregunta ${i + 1}`}
              />
              <textarea
                value={item.answer}
                onChange={e => updateFaq(item.id, "answer", e.target.value)}
                readOnly={readOnly}
                placeholder="Respuesta que dará el agente a esta pregunta."
                rows={3}
                className={cn(opsField, "resize-none")}
                aria-label={`Respuesta ${i + 1}`}
              />
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Knowledge sources ── */}
      <Panel
        title="Fuentes de conocimiento"
        description="Bases de conocimiento disponibles para que el agente consulte."
      >
        <div className="px-5 pb-5 space-y-4">
          {/* File upload (only when not readOnly) */}
          {!readOnly && (
            <div className="rounded-xl border border-dashed border-ops-bd p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ops-tx3 flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Subir documento (PDF, CSV, XLSX — máx. {MAX_MB} MB)
              </p>
              <input
                type="text"
                value={uploadedName}
                onChange={e => setUploadedName(e.target.value)}
                placeholder="Nombre de la fuente (opcional)"
                className={cn(opsField, "text-sm")}
                disabled={uploading}
              />
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border border-ops-bd px-3 py-2 text-sm text-ops-tx2 hover:border-ops-blue hover:text-ops-blue transition-colors",
                  uploading && "pointer-events-none opacity-50"
                )}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-ops-blue" aria-hidden="true" />
                ) : (
                  <FileText className="h-4 w-4" aria-hidden="true" />
                )}
                {uploading ? "Subiendo…" : "Seleccionar archivo"}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_EXTENSIONS}
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="sr-only"
                />
              </label>
              {uploadError && (
                <div className="flex items-start gap-2 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                  {uploadError}
                </div>
              )}
            </div>
          )}

          {/* Source list */}
          {knowledgeSources.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-ops-bd p-4">
              <BookOpen className="h-5 w-5 shrink-0 text-ops-tx3" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-ops-tx">Sin fuentes disponibles</p>
                <p className="text-xs text-ops-tx2">
                  Las fuentes de conocimiento se crean desde la configuración de Agentes IA.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {knowledgeSources.map(source => {
                const selected = config.knowledgeSourceIds.includes(source.id)
                const procBadge = source.sourceType === "file"
                  ? PROCESSING_STATUS_BADGE[source.processingStatus ?? "pending"]
                  : null
                const isUnavailable = source.sourceType === "file" && source.processingStatus !== "available"

                return (
                  <label
                    key={source.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors",
                      selected ? "border-ops-blue bg-ops-blue-bg" : "border-ops-bd hover:border-ops-bd2",
                      (readOnly || isUnavailable) && "cursor-default",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => !readOnly && !isUnavailable && toggleSource(source.id)}
                      disabled={readOnly || isUnavailable}
                      className="mt-0.5 h-4 w-4 rounded border-ops-bd accent-ops-blue"
                      aria-label={source.name}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-ops-tx">{source.name}</p>
                        {procBadge && (
                          <span className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                            procBadge.cls
                          )}>
                            {source.processingStatus === "processing" && (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                            )}
                            {procBadge.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ops-tx3">
                        {SOURCE_TYPE_LABEL[source.sourceType] ?? source.sourceType}
                      </p>
                      {source.processingStatus === "error" && source.processingError && (
                        <p className="mt-1 text-xs text-red-600 flex items-start gap-1">
                          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
                          {source.processingError}
                        </p>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}

"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { createFunnelAction, updateFunnelAction } from "@/domains/funnels/actions"
import type { Funnel, FunnelStageConfig, LeadStage } from "@/lib/db/schema"
import { Plus, Trash2 } from "lucide-react"

const PALETTE = ["#818cf8", "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#c084fc", "#fb923c", "#a3e635"]

const ALL_STAGE_OPTIONS: { key: LeadStage; defaultLabel: string; defaultColor: string }[] = [
  { key: "new", defaultLabel: "Nuevo", defaultColor: "#818cf8" },
  { key: "contacted", defaultLabel: "Contactado", defaultColor: "#60a5fa" },
  { key: "interested", defaultLabel: "Interesado", defaultColor: "#fbbf24" },
  { key: "quoted", defaultLabel: "Cotizado", defaultColor: "#c084fc" },
  { key: "won", defaultLabel: "Ganado", defaultColor: "#34d399" },
  { key: "lost", defaultLabel: "Perdido", defaultColor: "#f87171" },
]

interface StageRow {
  stageKey: LeadStage
  label: string
  color: string
  selected: boolean
}

function buildInitial(funnel: Funnel | null): StageRow[] {
  return ALL_STAGE_OPTIONS.map((opt) => {
    const existing = funnel?.stages.find((s) => s.stageKey === opt.key)
    return {
      stageKey: opt.key,
      label: existing?.label ?? opt.defaultLabel,
      color: existing?.color ?? opt.defaultColor,
      selected: !!existing,
    }
  })
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  funnel: Funnel | null
  onSuccess: (funnelId: string) => void
}

export function FunnelDialog({ open, onOpenChange, funnel, onSuccess }: Props) {
  const [name, setName] = useState(funnel?.name ?? "")
  const [stages, setStages] = useState<StageRow[]>(() => buildInitial(funnel))
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  // Reset when dialog opens with new funnel
  const reset = (f: Funnel | null) => {
    setName(f?.name ?? "")
    setStages(buildInitial(f))
    setError("")
  }

  function toggleStage(key: LeadStage) {
    setStages((prev) => prev.map((s) => (s.stageKey === key ? { ...s, selected: !s.selected } : s)))
  }

  function updateLabel(key: LeadStage, label: string) {
    setStages((prev) => prev.map((s) => (s.stageKey === key ? { ...s, label } : s)))
  }

  function updateColor(key: LeadStage, color: string) {
    setStages((prev) => prev.map((s) => (s.stageKey === key ? { ...s, color } : s)))
  }

  function handleSave() {
    setError("")
    const selected: FunnelStageConfig[] = stages
      .filter((s) => s.selected)
      .map(({ stageKey, label, color }) => ({ stageKey, label, color }))

    startTransition(async () => {
      const result = funnel
        ? await updateFunnelAction(funnel.id, name, selected)
        : await createFunnelAction(name, selected)

      if (!result.success) {
        setError(result.error ?? "Error desconocido")
        return
      }
      const id = funnel ? funnel.id : (result as unknown as { funnelId: string }).funnelId
      onSuccess(id)
      onOpenChange(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) reset(funnel)
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{funnel ? "Editar embudo" : "Nuevo embudo"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className="text-xs text-zinc-400 font-medium block mb-1.5">Nombre del embudo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Pipeline de ventas"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Stages */}
          <div>
            <label className="text-xs text-zinc-400 font-medium block mb-2">Etapas</label>
            <div className="space-y-2">
              {stages.map((s) => (
                <div
                  key={s.stageKey}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    s.selected ? "border-zinc-700 bg-zinc-800" : "border-zinc-800 bg-zinc-900/50 opacity-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={s.selected}
                    onChange={() => toggleStage(s.stageKey)}
                    className="h-4 w-4 rounded border-zinc-600 accent-indigo-500"
                  />
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <input
                    type="text"
                    value={s.label}
                    onChange={(e) => updateLabel(s.stageKey, e.target.value)}
                    disabled={!s.selected}
                    className="flex-1 bg-transparent text-sm text-zinc-200 focus:outline-none disabled:text-zinc-600"
                  />
                  <div className="flex gap-1 ml-auto">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        onClick={() => updateColor(s.stageKey, c)}
                        disabled={!s.selected}
                        className={`h-4 w-4 rounded-full transition-transform ${s.color === c ? "ring-2 ring-white scale-110" : ""} disabled:opacity-30`}
                        style={{ background: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-600 mt-1.5">
              Selecciona las etapas que aparecerán como columnas en el kanban.
            </p>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isPending || !name.trim()}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-40"
          >
            {isPending ? "Guardando…" : funnel ? "Guardar cambios" : "Crear embudo"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

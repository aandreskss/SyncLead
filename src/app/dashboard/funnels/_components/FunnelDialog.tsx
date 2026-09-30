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
            <label className="text-xs text-ops-tx2 font-medium block mb-1.5">Nombre del embudo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Pipeline de ventas"
              className="w-full h-9 bg-ops-s1 border border-ops-bd rounded-lg px-3 text-[13px] text-ops-tx placeholder:text-ops-tx3 outline-none focus-visible:border-ops-blue focus-visible:ring-2 focus-visible:ring-ops-blue/20"
            />
          </div>

          {/* Stages */}
          <div>
            <label className="text-xs text-ops-tx2 font-medium block mb-2">Etapas</label>
            <div className="space-y-2">
              {stages.map((s) => (
                <div
                  key={s.stageKey}
                  className={`flex items-center gap-3 p-3 rounded-[12px] border transition-colors ${
                    s.selected ? "border-ops-bd2 bg-ops-s2" : "border-ops-line bg-ops-s2/50 opacity-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={s.selected}
                    onChange={() => toggleStage(s.stageKey)}
                    className="h-4 w-4 rounded border-ops-bd accent-ops-blue"
                  />
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <input
                    type="text"
                    value={s.label}
                    onChange={(e) => updateLabel(s.stageKey, e.target.value)}
                    disabled={!s.selected}
                    className="flex-1 bg-transparent text-sm text-ops-tx focus:outline-none disabled:text-ops-tx3"
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
            <p className="text-xs text-ops-tx3 mt-1.5">
              Selecciona las etapas que aparecerán como columnas en el kanban.
            </p>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-ops-bd bg-ops-s1 px-4 py-2 text-sm font-medium text-ops-tx transition-colors hover:bg-ops-hover disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isPending || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-ops-coral px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Guardando…" : funnel ? "Guardar cambios" : "Crear embudo"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

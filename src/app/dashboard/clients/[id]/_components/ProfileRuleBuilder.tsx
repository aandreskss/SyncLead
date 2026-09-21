"use client"

import { useState, useTransition, useEffect } from "react"
import {
  getProfileAction,
  upsertRulesAction,
  previewProfileEvaluationAction,
  toggleRuleActiveAction,
  deleteRuleByIdAction,
} from "@/domains/qualification/profile-actions"
import type { QualificationProfile, QualificationRule } from "@/domains/qualification/profile-types"
import type { QualificationRuleInput } from "@/domains/qualification/profile-types"
import type { ConditionTree, ConditionLeaf, ConditionGroup, GroupOperator, Operator } from "@/domains/qualification/profile-types"
import { SYSTEM_FIELD_DEFINITIONS, ALL_FIELD_CATEGORIES } from "@/domains/qualification/field-registry"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  Trash2,
  Save,
  X,
  Loader2,
  ChevronDown,
  AlertCircle,
  PlayCircle,
  CheckCircle2,
} from "lucide-react"

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  profileId: string
  clientId: string
  onClose: () => void
}

// ─── Local rule draft type ────────────────────────────────────────────────────

interface LeafDraft {
  field: string
  operator: string
  value: string
  value2: string
}

interface RuleDraft {
  id?: string
  name: string
  priority: number
  active: boolean
  groupOperator: GroupOperator
  leaves: LeafDraft[]
  action: "add_score" | "force_result" | "disqualify"
  scoreDelta: number
  forcedResult: "hot" | "warm" | "cold" | "unqualified" | ""
  reason: string
  stopProcessing: boolean
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

function blankLeaf(): LeafDraft {
  return { field: "negocio_normalized", operator: "equals", value: "", value2: "" }
}

function blankRule(priority: number): RuleDraft {
  return {
    name: "Nueva regla",
    priority,
    active: true,
    groupOperator: "all",
    leaves: [blankLeaf()],
    action: "add_score",
    scoreDelta: 0,
    forcedResult: "",
    reason: "",
    stopProcessing: false,
  }
}

// ─── Draft builders ───────────────────────────────────────────────────────────

function conditionTreeToDraft(tree: ConditionTree): Pick<RuleDraft, "groupOperator" | "leaves"> {
  if (tree.type === "condition") {
    return {
      groupOperator: "all",
      leaves: [leafToDraft(tree)],
    }
  }
  // It's a group — flatten only top-level leaves (no nested groups in UI)
  const leaves = tree.conditions
    .filter((c): c is ConditionLeaf => c.type === "condition")
    .map(leafToDraft)
  return {
    groupOperator: tree.operator,
    leaves: leaves.length > 0 ? leaves : [blankLeaf()],
  }
}

function leafToDraft(leaf: ConditionLeaf): LeafDraft {
  return {
    field: leaf.field,
    operator: leaf.operator,
    value: leaf.value !== undefined && leaf.value !== null
      ? Array.isArray(leaf.value) ? leaf.value.join(", ") : String(leaf.value)
      : "",
    value2: leaf.value2 !== undefined && leaf.value2 !== null ? String(leaf.value2) : "",
  }
}

function ruleToDraft(rule: QualificationRule): RuleDraft {
  const { groupOperator, leaves } = conditionTreeToDraft(rule.conditions)
  return {
    id: rule.id,
    name: rule.name,
    priority: rule.priority,
    active: rule.active,
    groupOperator,
    leaves,
    action: rule.action,
    scoreDelta: rule.scoreDelta,
    forcedResult: (rule.forcedResult ?? "") as RuleDraft["forcedResult"],
    reason: rule.reason,
    stopProcessing: rule.stopProcessing,
  }
}

// ─── Draft → QualificationRuleInput ──────────────────────────────────────────

function leafDraftToConditionLeaf(leaf: LeafDraft): ConditionLeaf {
  const fieldDef = SYSTEM_FIELD_DEFINITIONS.find((f) => f.key === leaf.field)
  const dataType = fieldDef?.dataType ?? "text"

  // Parse value by data type
  let parsedValue: ConditionLeaf["value"] = leaf.value || undefined

  if (dataType === "number" && leaf.value) {
    parsedValue = parseFloat(leaf.value)
  } else if (dataType === "boolean") {
    parsedValue = undefined // boolean operators don't use value
  } else if (
    leaf.operator === "in_list" ||
    leaf.operator === "not_in_list" ||
    leaf.operator === "contains_any" ||
    leaf.operator === "contains_all"
  ) {
    // Comma-separated list
    parsedValue = leaf.value
      ? leaf.value.split(",").map((v) => v.trim()).filter(Boolean)
      : []
  }

  const cond: ConditionLeaf = {
    type: "condition",
    field: leaf.field,
    operator: leaf.operator as Operator,
    value: parsedValue,
  }

  if (leaf.value2) {
    cond.value2 = dataType === "number" ? parseFloat(leaf.value2) : leaf.value2
  }

  return cond
}

function draftToRuleInput(draft: RuleDraft): QualificationRuleInput {
  const conditions: ConditionTree =
    draft.leaves.length === 1
      ? leafDraftToConditionLeaf(draft.leaves[0])
      : ({
          type: "group",
          operator: draft.groupOperator,
          conditions: draft.leaves.map(leafDraftToConditionLeaf),
        } as ConditionGroup)

  return {
    name: draft.name,
    priority: draft.priority,
    active: draft.active,
    conditions,
    action: draft.action,
    scoreDelta: draft.scoreDelta,
    forcedResult: draft.action === "force_result" && draft.forcedResult
      ? (draft.forcedResult as "hot" | "warm" | "cold" | "unqualified")
      : null,
    reason: draft.reason,
    stopProcessing: draft.stopProcessing,
  }
}

// ─── Leaf editor ──────────────────────────────────────────────────────────────

function LeafEditor({
  leaf,
  onChange,
  onRemove,
  showRemove,
}: {
  leaf: LeafDraft
  onChange: (l: LeafDraft) => void
  onRemove: () => void
  showRemove: boolean
}) {
  const fieldDef = SYSTEM_FIELD_DEFINITIONS.find((f) => f.key === leaf.field)
  const operators = fieldDef?.allowedOperators ?? []
  const dataType = fieldDef?.dataType ?? "text"

  const showValueInput = !["is_empty", "is_not_empty", "is_true", "is_false", "is_unknown"].includes(leaf.operator)
  const showValue2 = leaf.operator === "between"

  return (
    <div className="flex items-start gap-2 flex-wrap">
      {/* Field selector */}
      <div className="flex-1 min-w-[140px]">
        <select
          value={leaf.field}
          onChange={(e) => onChange({ ...leaf, field: e.target.value, operator: "", value: "", value2: "" })}
          className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {ALL_FIELD_CATEGORIES.map((cat) => {
            const catFields = SYSTEM_FIELD_DEFINITIONS.filter((f) => f.category === cat.value)
            if (catFields.length === 0) return null
            return (
              <optgroup key={cat.value} label={cat.label} className="text-zinc-400">
                {catFields.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </optgroup>
            )
          })}
        </select>
      </div>

      {/* Operator selector */}
      <div className="min-w-[130px]">
        <select
          value={leaf.operator}
          onChange={(e) => onChange({ ...leaf, operator: e.target.value, value: "", value2: "" })}
          className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Operador…</option>
          {operators.map((op) => (
            <option key={op} value={op}>{operatorLabel(op)}</option>
          ))}
        </select>
      </div>

      {/* Value input */}
      {showValueInput && (
        <div className="min-w-[110px] flex-1">
          {dataType === "enum" && fieldDef?.enumOptions && fieldDef.enumOptions.length > 0 ? (
            <select
              value={leaf.value}
              onChange={(e) => onChange({ ...leaf, value: e.target.value })}
              className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Valor…</option>
              {fieldDef.enumOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <Input
              value={leaf.value}
              onChange={(e) => onChange({ ...leaf, value: e.target.value })}
              placeholder={
                leaf.operator === "in_list" || leaf.operator === "not_in_list"
                  ? "a, b, c"
                  : dataType === "number"
                  ? "0"
                  : "Valor"
              }
              type={dataType === "number" ? "number" : "text"}
              className="text-xs bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-600 h-8 px-2 focus-visible:ring-indigo-500"
            />
          )}
        </div>
      )}

      {/* Value2 for between */}
      {showValue2 && (
        <div className="min-w-[80px]">
          <Input
            value={leaf.value2}
            onChange={(e) => onChange({ ...leaf, value2: e.target.value })}
            placeholder="hasta"
            type={dataType === "number" ? "number" : "text"}
            className="text-xs bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-600 h-8 px-2 focus-visible:ring-indigo-500"
          />
        </div>
      )}

      {/* Remove leaf */}
      {showRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors mt-0.5"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── Operator labels ──────────────────────────────────────────────────────────

function operatorLabel(op: string): string {
  const labels: Record<string, string> = {
    equals: "igual a",
    not_equals: "distinto de",
    contains: "contiene",
    not_contains: "no contiene",
    starts_with: "comienza con",
    ends_with: "termina con",
    is_empty: "está vacío",
    is_not_empty: "no está vacío",
    in_list: "en lista",
    not_in_list: "fuera de lista",
    greater_than: ">",
    greater_than_or_equal: ">=",
    less_than: "<",
    less_than_or_equal: "<=",
    between: "entre",
    is_true: "es verdadero",
    is_false: "es falso",
    is_unknown: "es desconocido",
    before: "antes de",
    after: "después de",
    within_next_n_days: "en los próximos N días",
    within_last_n_days: "en los últimos N días",
    contains_any: "contiene alguno de",
    contains_all: "contiene todos",
  }
  return labels[op] ?? op
}

// ─── Rule card ────────────────────────────────────────────────────────────────

function RuleCard({
  draft,
  profileId,
  onChange,
  onDelete,
  isReadOnly,
}: {
  draft: RuleDraft
  profileId: string
  onChange: (d: RuleDraft) => void
  onDelete: () => void
  isReadOnly: boolean
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletePending, startDelete] = useTransition()
  const [togglePending, startToggle] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)

  function updateLeaf(i: number, l: LeafDraft) {
    const leaves = [...draft.leaves]
    leaves[i] = l
    onChange({ ...draft, leaves })
  }

  function addLeaf() {
    if (draft.leaves.length >= 5) return
    onChange({ ...draft, leaves: [...draft.leaves, blankLeaf()] })
  }

  function removeLeaf(i: number) {
    if (draft.leaves.length <= 1) return
    onChange({ ...draft, leaves: draft.leaves.filter((_, idx) => idx !== i) })
  }

  function handleToggleActive() {
    if (isReadOnly || togglePending) return
    const newActive = !draft.active
    if (draft.id) {
      const prevActive = draft.active
      onChange({ ...draft, active: newActive })
      startToggle(async () => {
        try {
          const r = await toggleRuleActiveAction(profileId, draft.id!, newActive)
          if ("error" in r) {
            onChange({ ...draft, active: prevActive })
            setActionError(r.error ?? null)
          }
        } catch {
          onChange({ ...draft, active: prevActive })
          setActionError("Error al actualizar la regla")
        }
      })
    } else {
      onChange({ ...draft, active: newActive })
    }
  }

  function handleDelete() {
    if (draft.id) {
      startDelete(async () => {
        try {
          const r = await deleteRuleByIdAction(profileId, draft.id!)
          if ("error" in r) {
            setActionError(r.error ?? null)
            setConfirmDelete(false)
          } else {
            onDelete()
          }
        } catch {
          setActionError("Error al eliminar la regla")
          setConfirmDelete(false)
        }
      })
    } else {
      onDelete()
    }
  }

  const showGroupOperator = draft.leaves.length > 1

  return (
    <div className="border border-zinc-800 rounded-xl p-4 space-y-4 bg-zinc-900/30">
      {/* Rule header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-zinc-500">Nombre</Label>
            <Input
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              disabled={isReadOnly}
              className="text-xs bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 h-8 focus-visible:ring-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-zinc-500">Prioridad</Label>
            <Input
              type="number"
              value={draft.priority}
              onChange={(e) => onChange({ ...draft, priority: parseInt(e.target.value) || 0 })}
              disabled={isReadOnly}
              className="text-xs bg-zinc-800 border-zinc-700 text-zinc-100 h-8 focus-visible:ring-indigo-500"
            />
          </div>
        </div>

        {/* Active toggle */}
        <div className="flex flex-col items-center gap-1 mt-4">
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={isReadOnly || togglePending}
            title={draft.active ? "Desactivar regla" : "Activar regla"}
            className={`relative flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${
              draft.active ? "bg-indigo-600" : "bg-zinc-700"
            }`}
          >
            {togglePending ? (
              <Loader2 className="absolute left-1 h-3 w-3 animate-spin text-white" />
            ) : (
              <span
                className={`absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  draft.active ? "translate-x-[18px]" : "translate-x-[2px]"
                }`}
              />
            )}
          </button>
          <span className="text-[10px] text-zinc-500 select-none">
            {draft.active ? "Activa" : "Inactiva"}
          </span>
        </div>

        {/* Delete */}
        {!isReadOnly && (
          confirmDelete ? (
            <div className="flex flex-col items-center gap-1 mt-4">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deletePending}
                className="text-[10px] px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {deletePending && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                Eliminar
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deletePending}
                className="text-[10px] text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="Eliminar regla"
              className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors mt-4"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )
        )}
      </div>

      {/* Action error */}
      {actionError && (
        <div className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          {actionError}
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="ml-auto text-zinc-600 hover:text-zinc-400"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Conditions section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-400">Condiciones</span>
          {showGroupOperator && (
            <select
              value={draft.groupOperator}
              onChange={(e) => onChange({ ...draft, groupOperator: e.target.value as GroupOperator })}
              disabled={isReadOnly}
              className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-0.5 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Todas (AND)</option>
              <option value="any">Alguna (OR)</option>
              <option value="none">Ninguna (NONE)</option>
            </select>
          )}
        </div>

        <div className="space-y-2">
          {draft.leaves.map((leaf, i) => (
            <LeafEditor
              key={i}
              leaf={leaf}
              onChange={(l) => updateLeaf(i, l)}
              onRemove={() => removeLeaf(i)}
              showRemove={draft.leaves.length > 1 && !isReadOnly}
            />
          ))}
        </div>

        {!isReadOnly && draft.leaves.length < 5 && (
          <button
            type="button"
            onClick={addLeaf}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-indigo-400 transition-colors mt-1"
          >
            <Plus className="h-3 w-3" />
            Añadir condición
          </button>
        )}
      </div>

      {/* Action section */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-zinc-500">Acción</Label>
          <select
            value={draft.action}
            onChange={(e) => onChange({ ...draft, action: e.target.value as RuleDraft["action"] })}
            disabled={isReadOnly}
            className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="add_score">Sumar puntos</option>
            <option value="force_result">Forzar resultado</option>
            <option value="disqualify">Descalificar</option>
          </select>
        </div>

        {draft.action === "add_score" && (
          <div className="space-y-1">
            <Label className="text-xs text-zinc-500">Puntos (+/-)</Label>
            <Input
              type="number"
              value={draft.scoreDelta}
              onChange={(e) => onChange({ ...draft, scoreDelta: parseInt(e.target.value) || 0 })}
              disabled={isReadOnly}
              min={-100}
              max={100}
              className="text-xs bg-zinc-800 border-zinc-700 text-zinc-100 h-8 focus-visible:ring-indigo-500"
            />
          </div>
        )}

        {draft.action === "force_result" && (
          <div className="space-y-1">
            <Label className="text-xs text-zinc-500">Resultado forzado</Label>
            <select
              value={draft.forcedResult}
              onChange={(e) => onChange({ ...draft, forcedResult: e.target.value as RuleDraft["forcedResult"] })}
              disabled={isReadOnly}
              className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Seleccionar…</option>
              <option value="hot">Caliente</option>
              <option value="warm">Tibio</option>
              <option value="cold">Frío</option>
              <option value="unqualified">Sin calificar</option>
            </select>
          </div>
        )}
      </div>

      {/* Reason & stop processing */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-zinc-500">Razón (visible en lead)</Label>
          <Input
            value={draft.reason}
            onChange={(e) => onChange({ ...draft, reason: e.target.value })}
            disabled={isReadOnly}
            placeholder="Ej: Tiene negocio en ciudad prioritaria"
            className="text-xs bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 h-8 focus-visible:ring-indigo-500"
          />
        </div>
        <div className="flex items-end pb-0.5">
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.stopProcessing}
              onChange={(e) => onChange({ ...draft, stopProcessing: e.target.checked })}
              disabled={isReadOnly}
              className="rounded border-zinc-700 bg-zinc-800 text-indigo-500 focus:ring-indigo-500"
            />
            Detener evaluación
          </label>
        </div>
      </div>
    </div>
  )
}

// ─── Preview panel ────────────────────────────────────────────────────────────

function PreviewPanel({ profileId }: { profileId: string }) {
  const [testValues, setTestValues] = useState<Record<string, string>>({
    negocio_normalized: "",
    city_canonical: "",
    ecom_cart_value: "",
  })
  const [result, setResult] = useState<null | {
    class: string
    score: number
    visibleLabel: string
    reasons: string[]
  }>(null)
  const [loading, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const classColors: Record<string, string> = {
    hot: "text-red-400",
    warm: "text-amber-400",
    cold: "text-blue-400",
    unqualified: "text-zinc-400",
  }

  function handlePreview() {
    setError(null)
    startTransition(async () => {
      const vals: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(testValues)) {
        if (v !== "") vals[k] = v
      }
      const r = await previewProfileEvaluationAction(profileId, vals)
      if ("error" in r) {
        setError(r.error ?? null)
      } else {
        setResult({
          class: r.class,
          score: r.score,
          visibleLabel: r.visibleLabel,
          reasons: r.reasons,
        })
      }
    })
  }

  return (
    <div className="space-y-3 border border-zinc-800 rounded-xl p-4 bg-zinc-900/30">
      <p className="text-xs font-medium text-zinc-400">Vista previa (prueba sin guardar)</p>

      <div className="grid grid-cols-3 gap-2">
        {Object.entries(testValues).map(([k, v]) => (
          <div key={k} className="space-y-1">
            <Label className="text-xs text-zinc-500">{k}</Label>
            <Input
              value={v}
              onChange={(e) => setTestValues((prev) => ({ ...prev, [k]: e.target.value }))}
              placeholder="—"
              className="text-xs bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-600 h-7 px-2 focus-visible:ring-indigo-500"
            />
          </div>
        ))}
      </div>

      <button
        onClick={handlePreview}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-indigo-900/30 hover:text-indigo-400 text-zinc-300 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
        Ejecutar preview
      </button>

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}

      {result && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${classColors[result.class] ?? "text-zinc-300"}`}>
              {result.visibleLabel}
            </span>
            <span className="text-xs text-zinc-500">Score: {result.score}</span>
          </div>
          {result.reasons.length > 0 && (
            <ul className="space-y-0.5">
              {result.reasons.map((r, i) => (
                <li key={i} className="text-xs text-zinc-500 flex items-start gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-zinc-600 mt-0.5 flex-shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main rule builder ────────────────────────────────────────────────────────

export function ProfileRuleBuilder({ profileId, clientId, onClose }: Props) {
  const [profile, setProfile] = useState<QualificationProfile | null>(null)
  const [drafts, setDrafts] = useState<RuleDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [savePending, startSave] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const isReadOnly = profile?.status !== "draft"

  useEffect(() => {
    loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  async function loadProfile() {
    setLoading(true)
    const r = await getProfileAction(profileId)
    if ("profile" in r && r.profile) {
      setProfile(r.profile as unknown as QualificationProfile)
      const rules = (r.profile as QualificationProfile & { rules?: QualificationRule[] }).rules ?? []
      setDrafts(rules.map(ruleToDraft))
    }
    setLoading(false)
  }

  function addRule() {
    const maxPriority = drafts.reduce((mx, d) => Math.max(mx, d.priority), 0)
    setDrafts([...drafts, blankRule(maxPriority + 10)])
  }

  function updateRule(i: number, d: RuleDraft) {
    const next = [...drafts]
    next[i] = d
    setDrafts(next)
  }

  function deleteRule(i: number) {
    setDrafts(drafts.filter((_, idx) => idx !== i))
  }

  function handleSave() {
    setSaveError(null)
    setSaveSuccess(false)
    startSave(async () => {
      const inputs: QualificationRuleInput[] = drafts.map(draftToRuleInput)
      const r = await upsertRulesAction(profileId, inputs)
      if ("error" in r) {
        setSaveError(r.error ?? null)
      } else {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      }
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-5 border-b border-zinc-800 flex-shrink-0">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-zinc-100 truncate">
              {profile?.name ?? "Perfil"}
            </h2>
            {profile && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  profile.status === "published"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : profile.status === "archived"
                    ? "bg-zinc-800 text-zinc-500"
                    : "bg-zinc-700 text-zinc-300"
                }`}
              >
                {profile.status === "published"
                  ? "Publicado"
                  : profile.status === "archived"
                  ? "Archivado"
                  : "Borrador"}
              </span>
            )}
          </div>
          {isReadOnly && (
            <p className="text-xs text-amber-400/80">
              Solo lectura — duplica el perfil para editar reglas.
            </p>
          )}
          {profile?.description && (
            <p className="text-xs text-zinc-500 line-clamp-1">{profile.description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Rules */}
        {drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-zinc-800 rounded-xl">
            <p className="text-zinc-500 text-sm">Sin reglas definidas</p>
            {!isReadOnly && (
              <p className="text-zinc-600 text-xs mt-1">
                Añade una regla para empezar a calificar leads.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {drafts
              .slice()
              .sort((a, b) => a.priority - b.priority)
              .map((draft, i) => (
                <RuleCard
                  key={draft.id ?? `draft-${i}`}
                  draft={draft}
                  profileId={profileId}
                  onChange={(d) => {
                    const originalIdx = drafts.indexOf(draft)
                    updateRule(originalIdx >= 0 ? originalIdx : i, d)
                  }}
                  onDelete={() => {
                    const originalIdx = drafts.indexOf(draft)
                    deleteRule(originalIdx >= 0 ? originalIdx : i)
                  }}
                  isReadOnly={isReadOnly}
                />
              ))}
          </div>
        )}

        {/* Add rule button */}
        {!isReadOnly && (
          <button
            onClick={addRule}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-dashed border-zinc-700 hover:border-indigo-500 text-zinc-500 hover:text-indigo-400 transition-colors w-full justify-center"
          >
            <Plus className="h-4 w-4" />
            Añadir regla
          </button>
        )}

        {/* Preview section */}
        <div className="pt-2">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Preview</p>
          <PreviewPanel profileId={profileId} />
        </div>
      </div>

      {/* Footer actions */}
      {!isReadOnly && (
        <div className="flex items-center gap-3 p-5 border-t border-zinc-800 flex-shrink-0 bg-zinc-950">
          {saveError && (
            <p className="text-xs text-red-400 flex items-center gap-1 flex-1">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {saveError}
            </p>
          )}
          {saveSuccess && (
            <p className="text-xs text-emerald-400 flex items-center gap-1 flex-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Reglas guardadas
            </p>
          )}
          {!saveError && !saveSuccess && <span className="flex-1" />}

          <Button
            onClick={handleSave}
            disabled={savePending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm disabled:opacity-50"
          >
            {savePending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            <Save className="h-4 w-4 mr-1.5" />
            Guardar reglas
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={savePending}
            className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 text-sm"
          >
            Cerrar
          </Button>
        </div>
      )}

      {isReadOnly && (
        <div className="p-5 border-t border-zinc-800 flex-shrink-0 bg-zinc-950">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 text-sm w-full"
          >
            Cerrar
          </Button>
        </div>
      )}
    </div>
  )
}

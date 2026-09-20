// ─── Condition evaluator ──────────────────────────────────────────────────────
// Pure functions — no I/O, no side effects, never throws.

import type {
  ConditionLeaf,
  ConditionGroup,
  ConditionTree,
  FieldDataType,
  FieldDefinition,
  LeadEvaluationContext,
} from "./profile-types"
import { OPERATORS_BY_TYPE } from "./profile-types"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStr(v: unknown): string {
  return String(v ?? "").trim().toLowerCase()
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === "string") return v.trim() === ""
  if (Array.isArray(v)) return v.length === 0
  return false
}

function toNum(v: unknown): number {
  return Number(v)
}

function isValidDate(d: Date): boolean {
  return !isNaN(d.getTime())
}

// ─── Leaf evaluation by type ──────────────────────────────────────────────────

function evaluateText(operator: string, value: unknown, condVal: unknown, condVal2?: unknown): boolean {
  const v = toStr(value)
  const c = toStr(condVal)

  switch (operator) {
    case "equals":         return v === c
    case "not_equals":     return v !== c
    case "contains":       return v.includes(c)
    case "not_contains":   return !v.includes(c)
    case "starts_with":    return v.startsWith(c)
    case "ends_with":      return v.endsWith(c)
    case "is_empty":       return isEmpty(value)
    case "is_not_empty":   return !isEmpty(value)
    case "in_list": {
      if (!Array.isArray(condVal)) return false
      const vLow = String(value ?? "").toLowerCase()
      return condVal.some((item) => String(item ?? "").toLowerCase() === vLow)
    }
    case "not_in_list": {
      if (!Array.isArray(condVal)) return true
      const vLow = String(value ?? "").toLowerCase()
      return !condVal.some((item) => String(item ?? "").toLowerCase() === vLow)
    }
    default: return false
  }
}

function evaluateNumber(operator: string, value: unknown, condVal: unknown, condVal2?: unknown): boolean {
  if (operator === "is_empty")     return value === null || value === undefined || isNaN(toNum(value))
  if (operator === "is_not_empty") return value !== null && value !== undefined && !isNaN(toNum(value))

  const n = toNum(value)
  if (isNaN(n)) return false
  const c = toNum(condVal)

  switch (operator) {
    case "equals":                  return n === c
    case "not_equals":              return n !== c
    case "greater_than":            return n > c
    case "greater_than_or_equal":   return n >= c
    case "less_than":               return n < c
    case "less_than_or_equal":      return n <= c
    case "between": {
      const c2 = toNum(condVal2)
      return n >= c && n <= c2
    }
    default: return false
  }
}

function evaluateBoolean(operator: string, value: unknown): boolean {
  switch (operator) {
    case "is_true":    return Boolean(value) === true
    case "is_false":   return Boolean(value) === false
    case "is_unknown": return value === null || value === undefined
    default: return false
  }
}

function evaluateDate(operator: string, value: unknown, condVal: unknown, condVal2?: unknown): boolean {
  if (operator === "is_empty")     return isEmpty(value)
  if (operator === "is_not_empty") return !isEmpty(value)

  const d = new Date(String(value ?? ""))
  if (!isValidDate(d)) return false

  switch (operator) {
    case "before": {
      const c = new Date(String(condVal ?? ""))
      return isValidDate(c) && d < c
    }
    case "after": {
      const c = new Date(String(condVal ?? ""))
      return isValidDate(c) && d > c
    }
    case "between": {
      const c1 = new Date(String(condVal ?? ""))
      const c2 = new Date(String(condVal2 ?? ""))
      return isValidDate(c1) && isValidDate(c2) && d >= c1 && d <= c2
    }
    case "within_next_n_days": {
      const n = toNum(condVal)
      if (isNaN(n)) return false
      const now = Date.now()
      const ms = n * 86_400_000
      return d.getTime() >= now && d.getTime() <= now + ms
    }
    case "within_last_n_days": {
      const n = toNum(condVal)
      if (isNaN(n)) return false
      const now = Date.now()
      const ms = n * 86_400_000
      return d.getTime() <= now && d.getTime() >= now - ms
    }
    default: return false
  }
}

function evaluateEnum(operator: string, value: unknown, condVal: unknown): boolean {
  // Enum reuses text equals/not_equals/in_list/not_in_list (case-insensitive)
  const v = toStr(value)
  const c = toStr(condVal)

  switch (operator) {
    case "equals":     return v === c
    case "not_equals": return v !== c
    case "in_list": {
      if (!Array.isArray(condVal)) return false
      return condVal.some((item) => String(item ?? "").toLowerCase() === v)
    }
    case "not_in_list": {
      if (!Array.isArray(condVal)) return true
      return !condVal.some((item) => String(item ?? "").toLowerCase() === v)
    }
    case "is_empty":     return isEmpty(value)
    case "is_not_empty": return !isEmpty(value)
    default: return false
  }
}

function evaluateMultiSelect(operator: string, value: unknown, condVal: unknown): boolean {
  const arr = Array.isArray(value) ? value.map((x) => String(x ?? "").toLowerCase()) : []

  switch (operator) {
    case "contains_any": {
      if (!Array.isArray(condVal)) return false
      const targets = condVal.map((x) => String(x ?? "").toLowerCase())
      return targets.some((t) => arr.includes(t))
    }
    case "contains_all": {
      if (!Array.isArray(condVal)) return false
      const targets = condVal.map((x) => String(x ?? "").toLowerCase())
      return targets.every((t) => arr.includes(t))
    }
    case "is_empty":     return arr.length === 0 || isEmpty(value)
    case "is_not_empty": return arr.length > 0 && !isEmpty(value)
    default: return false
  }
}

// ─── Public evaluators ────────────────────────────────────────────────────────

/** Evaluates a single condition leaf against a resolved value. */
export function evaluateLeaf(
  leaf: ConditionLeaf,
  value: unknown,
  dataType: FieldDataType,
): boolean {
  const allowed = OPERATORS_BY_TYPE[dataType] as readonly string[]
  if (!allowed.includes(leaf.operator)) return false

  switch (dataType) {
    case "text":         return evaluateText(leaf.operator, value, leaf.value, leaf.value2)
    case "number":       return evaluateNumber(leaf.operator, value, leaf.value, leaf.value2)
    case "boolean":      return evaluateBoolean(leaf.operator, value)
    case "date":         return evaluateDate(leaf.operator, value, leaf.value, leaf.value2)
    case "enum":         return evaluateEnum(leaf.operator, value, leaf.value)
    case "multi_select": return evaluateMultiSelect(leaf.operator, value, leaf.value)
    default:             return false
  }
}

/** Evaluates a condition group (AND / OR / NONE) against the context. */
export function evaluateGroup(
  group: ConditionGroup,
  context: LeadEvaluationContext,
  fieldDefs: Map<string, FieldDefinition>,
  depth: number = 0,
): boolean {
  const { operator, conditions } = group

  if (operator === "all") {
    return conditions.every((child) =>
      evaluateConditionTree(child as ConditionTree, context, fieldDefs, depth + 1)
    )
  }
  if (operator === "any") {
    return conditions.some((child) =>
      evaluateConditionTree(child as ConditionTree, context, fieldDefs, depth + 1)
    )
  }
  if (operator === "none") {
    return !conditions.some((child) =>
      evaluateConditionTree(child as ConditionTree, context, fieldDefs, depth + 1)
    )
  }
  return false
}

/** Entry point: evaluates any ConditionTree node. */
export function evaluateConditionTree(
  tree: ConditionTree,
  context: LeadEvaluationContext,
  fieldDefs: Map<string, FieldDefinition>,
  depth: number = 0,
): boolean {
  if (tree.type === "group") {
    return evaluateGroup(tree, context, fieldDefs, depth)
  }

  // It's a leaf
  const fieldDef = fieldDefs.get(tree.field)
  const value = Object.prototype.hasOwnProperty.call(context.fields, tree.field)
    ? context.fields[tree.field]
    : null

  if (!fieldDef) {
    // Unknown field → treat as null → is_empty = true, everything else false
    if (tree.operator === "is_empty") return true
    return false
  }

  return evaluateLeaf(tree, value, fieldDef.dataType)
}

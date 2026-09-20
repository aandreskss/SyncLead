// ─── Qualification profile types ─────────────────────────────────────────────
// Generic, score-based qualification engine — configurable per client.
// All pure types; no I/O or side effects.

import { z } from "zod"
import type { QualificationClass } from "./types"

// Re-export for convenience
export type { QualificationClass }
export type { QualificationType } from "./types"

// ─── Engine limits ────────────────────────────────────────────────────────────

export const MAX_RULES_PER_PROFILE = 50
export const MAX_CONDITIONS_PER_GROUP = 20
export const MAX_GROUP_DEPTH = 3
export const MAX_VALUE_LENGTH = 500
export const MAX_LIST_VALUES = 100
export const MIN_SCORE = 0
export const MAX_SCORE = 100

// ─── Operators ────────────────────────────────────────────────────────────────

export const TEXT_OPERATORS = [
  "equals", "not_equals", "contains", "not_contains",
  "starts_with", "ends_with", "is_empty", "is_not_empty",
  "in_list", "not_in_list",
] as const
export type TextOperator = (typeof TEXT_OPERATORS)[number]

export const NUMBER_OPERATORS = [
  "equals", "not_equals", "greater_than", "greater_than_or_equal",
  "less_than", "less_than_or_equal", "between", "is_empty", "is_not_empty",
] as const
export type NumberOperator = (typeof NUMBER_OPERATORS)[number]

export const BOOLEAN_OPERATORS = ["is_true", "is_false", "is_unknown"] as const
export type BooleanOperator = (typeof BOOLEAN_OPERATORS)[number]

export const DATE_OPERATORS = [
  "before", "after", "between",
  "within_next_n_days", "within_last_n_days",
  "is_empty", "is_not_empty",
] as const
export type DateOperator = (typeof DATE_OPERATORS)[number]

export const ENUM_OPERATORS = [
  "equals", "not_equals", "in_list", "not_in_list",
] as const
export type EnumOperator = (typeof ENUM_OPERATORS)[number]

export const MULTI_SELECT_OPERATORS = [
  "contains_any", "contains_all", "is_empty", "is_not_empty",
] as const
export type MultiSelectOperator = (typeof MULTI_SELECT_OPERATORS)[number]

export type Operator =
  | TextOperator | NumberOperator | BooleanOperator
  | DateOperator | EnumOperator | MultiSelectOperator

export type FieldDataType = "text" | "number" | "boolean" | "date" | "enum" | "multi_select"
export type FieldSource = "standard" | "utm" | "device" | "event" | "custom" | "ecommerce"
export type FieldCategory =
  | "identity" | "location" | "business"
  | "ecommerce" | "attribution" | "device" | "behavior" | "custom"

export const OPERATORS_BY_TYPE: Record<FieldDataType, readonly string[]> = {
  text: TEXT_OPERATORS,
  number: NUMBER_OPERATORS,
  boolean: BOOLEAN_OPERATORS,
  date: DATE_OPERATORS,
  enum: ENUM_OPERATORS,
  multi_select: MULTI_SELECT_OPERATORS,
}

// ─── Field definitions ────────────────────────────────────────────────────────

export interface EventFieldConfig {
  /** e.g. "add_to_cart", "begin_checkout" */
  eventType: string
  aggregation: "count" | "sum" | "max" | "min" | "any" | "latest_value"
  /** Column on lead_behavior_events to aggregate (for sum/max/min) */
  valueField?: string
  /** Rolling window in days. Undefined = all time */
  windowDays?: number
  /** Max number of matches counted (prevents unbounded points) */
  maxMatches?: number
  /** Deduplication scope */
  dedupBy?: "event_id" | "product_id" | "session"
}

export interface NormalizationStep {
  strategy:
    | "trim"
    | "lowercase"
    | "remove_accents"
    | "collapse_whitespace"
    | "parse_number"
    | "parse_boolean"
    | "city_alias_map"
    | "enum_aliases"
  /** For parse_boolean: strings treated as true */
  trueValues?: string[]
  /** For parse_boolean: strings treated as false */
  falseValues?: string[]
  /** For city_alias_map or enum_aliases: alias → canonical form */
  aliases?: Record<string, string>
}

export interface FieldDefinition {
  id: string
  /** null = system-wide field */
  orgId: string | null
  /** null = org-wide or system */
  clientId: string | null
  /** Stable machine key (snake_case). Used in condition trees. */
  key: string
  /** Human-readable label for the rule builder UI */
  label: string
  dataType: FieldDataType
  source: FieldSource
  category: FieldCategory
  isSensitive: boolean
  allowedOperators: Operator[]
  normalization: NormalizationStep[]
  /** Valid values for enum / multi_select fields */
  enumOptions: string[]
  /** If true: missing field → evaluation result is "unqualified" */
  isRequiredForEval: boolean
  /** Extra config for event-sourced fields */
  eventConfig?: EventFieldConfig
  /** DB column name (for standard fields mapped to leads columns) */
  leadsColumn?: string
}

// ─── Condition tree ───────────────────────────────────────────────────────────

export type ConditionValue = string | number | boolean | string[] | null | undefined

export interface ConditionLeaf {
  type: "condition"
  /** Field key from the field registry */
  field: string
  operator: Operator
  /** Primary comparison value */
  value?: ConditionValue
  /** Secondary value for "between" operators */
  value2?: string | number
}

export type GroupOperator = "all" | "any" | "none"

export interface ConditionGroup {
  type: "group"
  operator: GroupOperator
  conditions: Array<ConditionLeaf | ConditionGroup>
}

export type ConditionTree = ConditionLeaf | ConditionGroup

// ─── Rules ────────────────────────────────────────────────────────────────────

export type RuleAction = "add_score" | "force_result" | "disqualify"

export interface QualificationRule {
  id: string
  orgId: string
  profileId: string
  name: string
  description: string | null
  /** Lower number = evaluated first */
  priority: number
  active: boolean
  conditions: ConditionTree
  action: RuleAction
  /** Points added (positive) or subtracted (negative). Used when action="add_score" */
  scoreDelta: number
  /** Class to force. Used when action="force_result" */
  forcedResult: QualificationClass | null
  /** Human-readable explanation shown in lead detail */
  reason: string
  /** If true, no further rules are evaluated after this one matches */
  stopProcessing: boolean
  createdAt: Date
  updatedAt: Date
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export type ProfileStatus = "draft" | "published" | "archived"

export interface ProfileThresholds {
  /** Score ≥ min → "hot" */
  hot: { min: number }
  /** min ≤ score ≤ max → "warm" */
  warm: { min: number; max: number }
  /** score ≤ max → "cold" (and ≥ 0) */
  cold: { max: number }
}

export const DEFAULT_THRESHOLDS: ProfileThresholds = {
  hot: { min: 70 },
  warm: { min: 40, max: 69 },
  cold: { max: 39 },
}

export interface ResultLabels {
  hot?: string
  warm?: string
  cold?: string
  unqualified?: string
}

export interface QualificationProfile {
  id: string
  orgId: string
  /** null = org-wide profile */
  clientId: string | null
  name: string
  description: string | null
  status: ProfileStatus
  version: number
  /** Starting score before rules are applied */
  initialScore: number
  thresholds: ProfileThresholds
  /** Custom display labels. Fallback to Spanish defaults if not set */
  resultLabels: ResultLabels
  publishedAt: Date | null
  publishedBy: string | null
  createdAt: Date
  updatedAt: Date
  rules?: QualificationRule[]
}

// ─── Evaluation inputs & results ──────────────────────────────────────────────

export type EvaluationTrigger =
  | "ingest"
  | "field_change"
  | "manual_request"
  | "batch"
  | "rule_change"

export interface LeadEvaluationContext {
  /** Normalized values for rule evaluation, keyed by field.key */
  fields: Record<string, unknown>
  /** Raw un-normalized values, stored in snapshot */
  rawFields: Record<string, unknown>
  /** Required fields that are absent */
  missingFields: string[]
}

export interface MatchedRule {
  ruleId: string
  ruleName: string
  scoreDelta: number
  reason: string
  forcedResult: QualificationClass | null
  stoppedProcessing: boolean
}

export interface ProfileEvaluationResult {
  profileId: string
  profileVersion: number
  score: number
  class: QualificationClass
  visibleLabel: string
  reasons: string[]
  matchedRules: MatchedRule[]
  /** Snapshot of field values used — no sensitive PII */
  inputs: Record<string, unknown>
  missingFields: string[]
  evalDurationMs: number
}

// ─── Zod schemas for validation ───────────────────────────────────────────────

const ConditionValueSchema = z
  .union([
    z.string().max(MAX_VALUE_LENGTH),
    z.number(),
    z.boolean(),
    z.array(z.string().max(MAX_VALUE_LENGTH)).max(MAX_LIST_VALUES),
    z.null(),
  ])
  .optional()

// operator is validated as a plain string here; field-type validation happens at runtime
export const ConditionLeafSchema = z.object({
  type: z.literal("condition"),
  field: z.string().min(1).max(100),
  operator: z.string().min(1).max(50),
  value: ConditionValueSchema,
  value2: z.union([z.string().max(MAX_VALUE_LENGTH), z.number()]).optional(),
})

// conditions is z.any() here; recursive depth is checked via validateConditionTreeDepth()
export const ConditionGroupSchema = z.object({
  type: z.literal("group"),
  operator: z.enum(["all", "any", "none"]),
  conditions: z.array(z.any()).min(1).max(MAX_CONDITIONS_PER_GROUP),
})

export const ConditionTreeSchema = z.union([ConditionLeafSchema, ConditionGroupSchema])

export const ProfileThresholdsSchema = z.object({
  hot: z.object({ min: z.number().min(0).max(100) }),
  warm: z.object({ min: z.number().min(0).max(100), max: z.number().min(0).max(100) }),
  cold: z.object({ max: z.number().min(0).max(100) }),
})

export const QualificationRuleInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional().nullable(),
  priority: z.number().int().min(0).max(9999),
  active: z.boolean().default(true),
  conditions: ConditionTreeSchema,
  action: z.enum(["add_score", "force_result", "disqualify"]),
  scoreDelta: z.number().int().min(-100).max(100).default(0),
  forcedResult: z.enum(["hot", "warm", "cold", "unqualified"]).optional().nullable(),
  reason: z.string().max(500).default(""),
  stopProcessing: z.boolean().default(false),
})
export type QualificationRuleInput = z.infer<typeof QualificationRuleInputSchema>

export const QualificationProfileInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  initialScore: z.number().int().min(0).max(100).default(0),
  thresholds: ProfileThresholdsSchema.default(DEFAULT_THRESHOLDS),
  resultLabels: z.object({
    hot: z.string().max(100).optional(),
    warm: z.string().max(100).optional(),
    cold: z.string().max(100).optional(),
    unqualified: z.string().max(100).optional(),
  }).default({}),
})
export type QualificationProfileInput = z.infer<typeof QualificationProfileInputSchema>

// ─── Validation helpers ───────────────────────────────────────────────────────

/** Recursively validates condition tree depth. Returns error message or null. */
export function validateConditionTreeDepth(
  tree: ConditionTree,
  depth: number = 0,
): string | null {
  if (depth > MAX_GROUP_DEPTH) {
    return `Condition tree exceeds maximum nesting depth of ${MAX_GROUP_DEPTH}`
  }
  if (tree.type === "group") {
    if (tree.conditions.length > MAX_CONDITIONS_PER_GROUP) {
      return `Group has too many conditions (max ${MAX_CONDITIONS_PER_GROUP})`
    }
    for (const child of tree.conditions) {
      const err = validateConditionTreeDepth(child as ConditionTree, depth + 1)
      if (err) return err
    }
  }
  return null
}

/** Returns the visible label for a qualification class, given profile labels. */
export function getVisibleLabel(
  cls: QualificationClass,
  labels: ResultLabels,
): string {
  const defaults: Record<QualificationClass, string> = {
    hot: "Caliente",
    warm: "Tibio",
    cold: "Frío",
    unqualified: "Sin calificar",
  }
  return labels[cls] ?? defaults[cls]
}

/** Clamps score to [MIN_SCORE, MAX_SCORE]. */
export function clampScore(score: number): number {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, score))
}

/** Determines qualification class from final score and thresholds. */
export function scoreToClass(score: number, thresholds: ProfileThresholds): QualificationClass {
  if (score >= thresholds.hot.min) return "hot"
  if (score >= thresholds.warm.min && score <= thresholds.warm.max) return "warm"
  return "cold"
}

// ─── Savaya template factory ──────────────────────────────────────────────────

/** Creates the rule definitions that replicate Savaya v1 logic for a given city list. */
export function buildSavayaRuleInputs(
  priorityCities: string[],
): QualificationRuleInput[] {
  return [
    {
      name: "Datos insuficientes",
      description: "No se puede calificar sin respuesta de negocio",
      priority: 10,
      active: true,
      conditions: {
        type: "condition",
        field: "negocio_normalized",
        operator: "is_empty",
      } satisfies ConditionLeaf,
      action: "disqualify",
      scoreDelta: 0,
      forcedResult: null,
      reason: "Respuesta de negocio ausente o no reconocida.",
      stopProcessing: true,
    },
    {
      name: "Sin negocio",
      description: "El lead indicó que no tiene negocio",
      priority: 20,
      active: true,
      conditions: {
        type: "condition",
        field: "negocio_normalized",
        operator: "equals",
        value: "no",
      } satisfies ConditionLeaf,
      action: "force_result",
      scoreDelta: 0,
      forcedResult: "cold",
      reason: "El lead indicó que no tiene negocio.",
      stopProcessing: true,
    },
    {
      name: "Negocio + ciudad prioritaria",
      description: "Tiene negocio y está en una ciudad de alta prioridad",
      priority: 30,
      active: true,
      conditions: {
        type: "group",
        operator: "all",
        conditions: [
          { type: "condition", field: "negocio_normalized", operator: "equals", value: "si" },
          {
            type: "condition",
            field: "city_canonical",
            operator: "in_list",
            value: priorityCities,
          },
        ],
      } satisfies ConditionGroup,
      action: "force_result",
      scoreDelta: 80,
      forcedResult: "hot",
      reason: "El lead tiene negocio y está en una ciudad prioritaria.",
      stopProcessing: true,
    },
    {
      name: "Negocio fuera de ciudad prioritaria",
      description: "Tiene negocio pero no está en ciudad prioritaria (o sin ciudad)",
      priority: 40,
      active: true,
      conditions: {
        type: "condition",
        field: "negocio_normalized",
        operator: "equals",
        value: "si",
      } satisfies ConditionLeaf,
      action: "force_result",
      scoreDelta: 50,
      forcedResult: "warm",
      reason: "El lead tiene negocio, pero la ciudad no es prioritaria o no fue especificada.",
      stopProcessing: true,
    },
  ]
}

// ─── Score-based profile evaluation engine ────────────────────────────────────
// Pure functions — no I/O, no side effects, never throws.

import type {
  FieldDefinition,
  LeadEvaluationContext,
  MatchedRule,
  NormalizationStep,
  ProfileEvaluationResult,
  ProfileThresholds,
  QualificationRule,
  ResultLabels,
} from "./profile-types"
import {
  clampScore,
  getVisibleLabel,
  scoreToClass,
} from "./profile-types"
import type { QualificationClass } from "./types"
import { removeAccents, canonicalize } from "./normalize"
import { evaluateConditionTree } from "./condition-evaluator"

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * Applies normalization steps to a raw value in order.
 * Pure — no I/O.
 */
export function applyNormalization(
  raw: unknown,
  steps: NormalizationStep[],
): unknown {
  let value: unknown = raw

  for (const step of steps) {
    switch (step.strategy) {
      case "trim": {
        if (typeof value === "string") value = value.trim()
        break
      }
      case "lowercase": {
        if (typeof value === "string") value = value.toLowerCase()
        break
      }
      case "remove_accents": {
        if (typeof value === "string") value = removeAccents(value)
        break
      }
      case "collapse_whitespace": {
        if (typeof value === "string") value = value.replace(/\s+/g, " ")
        break
      }
      case "parse_number": {
        const n = parseFloat(String(value ?? ""))
        value = isNaN(n) ? null : n
        break
      }
      case "parse_boolean": {
        const s = String(value ?? "").trim().toLowerCase()
        const trueVals = step.trueValues?.map((v) => v.toLowerCase()) ?? []
        const falseVals = step.falseValues?.map((v) => v.toLowerCase()) ?? []
        if (trueVals.includes(s)) value = true
        else if (falseVals.includes(s)) value = false
        else value = null
        break
      }
      case "city_alias_map": {
        if (typeof value === "string") {
          const canonical = canonicalize(value)
          if (canonical && step.aliases) {
            value = step.aliases[canonical] ?? canonical
          } else if (canonical) {
            value = canonical
          }
        }
        break
      }
      case "enum_aliases": {
        if (typeof value === "string") {
          const lower = value.toLowerCase()
          if (step.aliases) {
            value = step.aliases[lower] ?? lower
          }
        }
        break
      }
    }
  }

  return value
}

// ─── Column name → camelCase lead property map ────────────────────────────────

// Maps leadsColumn values to camelCase property names on the lead object.
const LEADS_COLUMN_MAP: Record<string, string> = {
  name: "name",
  email: "email",
  phone: "phone",
  city: "city",
  cityCanonical: "cityCanonical",
  negocioNormalized: "negocioNormalized",
  negocioRaw: "negocioRaw",
  utmSource: "utmSource",
  utmMedium: "utmMedium",
  utmCampaign: "utmCampaign",
  fbclid: "fbclid",
  platform: "platform",
  device: "device",
}

type LeadInput = {
  name?: string | null
  email?: string | null
  phone?: string | null
  city?: string | null
  cityCanonical?: string | null
  negocioNormalized?: string | null
  negocioRaw?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  fbclid?: string | null
  platform?: string | null
  device?: string | null
  customData?: Record<string, unknown>
}

function readLeadColumn(lead: LeadInput, leadsColumn: string): unknown {
  const key = LEADS_COLUMN_MAP[leadsColumn] ?? leadsColumn
  return (lead as Record<string, unknown>)[key] ?? null
}

// ─── Context builder ──────────────────────────────────────────────────────────

/**
 * Builds the evaluation context from a lead's data.
 * Reads standard fields from the lead object, custom/ecommerce fields from
 * customData, and event fields from pre-aggregated eventData.
 */
export function buildLeadContext(
  lead: LeadInput,
  fieldDefs: FieldDefinition[],
  eventData?: Record<string, unknown>,
): LeadEvaluationContext {
  const fields: Record<string, unknown> = {}
  const rawFields: Record<string, unknown> = {}
  const missingFields: string[] = []

  for (const def of fieldDefs) {
    let raw: unknown

    // 1. Resolve raw value by source
    switch (def.source) {
      case "standard":
      case "utm":
      case "device": {
        raw = def.leadsColumn ? readLeadColumn(lead, def.leadsColumn) : null
        break
      }
      case "event": {
        raw = eventData ? (eventData[def.key] ?? null) : null
        break
      }
      case "ecommerce":
      case "custom": {
        raw = lead.customData ? (lead.customData[def.key] ?? null) : null
        break
      }
      default:
        raw = null
    }

    // 2. Apply normalization steps
    const normalized = applyNormalization(raw, def.normalization)

    // 3. Store
    rawFields[def.key] = raw
    fields[def.key] = normalized

    // 4. Check required
    if (def.isRequiredForEval && (normalized === null || normalized === undefined)) {
      missingFields.push(def.key)
    }
  }

  return { fields, rawFields, missingFields }
}

// ─── Profile evaluation ───────────────────────────────────────────────────────

/**
 * Evaluates a profile + its rules against a lead context.
 * Pure — returns ProfileEvaluationResult without writing to DB.
 */
export function evaluateProfile(
  profile: {
    id: string
    version: number
    initialScore: number
    thresholds: ProfileThresholds
    resultLabels: ResultLabels
  },
  rules: QualificationRule[],
  context: LeadEvaluationContext,
  fieldDefs: FieldDefinition[],
): ProfileEvaluationResult {
  const startMs = Date.now()

  // Build field definition map for O(1) lookups
  const fieldDefMap = new Map<string, FieldDefinition>(
    fieldDefs.map((f) => [f.key, f])
  )

  // If any required field is missing → unqualified immediately
  if (context.missingFields.length > 0) {
    const cls: QualificationClass = "unqualified"
    return {
      profileId: profile.id,
      profileVersion: profile.version,
      score: 0,
      class: cls,
      visibleLabel: getVisibleLabel(cls, profile.resultLabels),
      reasons: [`Campos requeridos ausentes: ${context.missingFields.join(", ")}`],
      matchedRules: [],
      inputs: buildInputSnapshot(context, fieldDefs),
      missingFields: context.missingFields,
      evalDurationMs: Date.now() - startMs,
    }
  }

  // Sort active rules by priority ascending, filter active only
  const activeRules = rules
    .filter((r) => r.active)
    .sort((a, b) => a.priority - b.priority)

  let score = clampScore(profile.initialScore)
  const matchedRules: MatchedRule[] = []
  const reasons: string[] = []
  let forcedResult: QualificationClass | null = null
  let disqualified = false
  let disqualifyReason = ""

  for (const rule of activeRules) {
    const matched = evaluateConditionTree(
      rule.conditions as import("./profile-types").ConditionTree,
      context,
      fieldDefMap,
    )

    if (!matched) continue

    matchedRules.push({
      ruleId: rule.id,
      ruleName: rule.name,
      scoreDelta: rule.scoreDelta,
      reason: rule.reason,
      forcedResult: rule.forcedResult as QualificationClass | null,
      stoppedProcessing: rule.stopProcessing,
    })

    if (rule.reason) reasons.push(rule.reason)

    if (rule.action === "disqualify") {
      disqualified = true
      disqualifyReason = rule.reason
      break
    }

    if (rule.action === "force_result" && rule.forcedResult) {
      forcedResult = rule.forcedResult as QualificationClass
    }

    if (rule.action === "add_score") {
      score = clampScore(score + rule.scoreDelta)
    }

    if (rule.stopProcessing) break
  }

  if (disqualified) {
    const cls: QualificationClass = "unqualified"
    return {
      profileId: profile.id,
      profileVersion: profile.version,
      score: 0,
      class: cls,
      visibleLabel: getVisibleLabel(cls, profile.resultLabels),
      reasons: disqualifyReason ? [disqualifyReason] : reasons,
      matchedRules,
      inputs: buildInputSnapshot(context, fieldDefs),
      missingFields: context.missingFields,
      evalDurationMs: Date.now() - startMs,
    }
  }

  const finalClass: QualificationClass =
    forcedResult ?? scoreToClass(score, profile.thresholds)

  return {
    profileId: profile.id,
    profileVersion: profile.version,
    score,
    class: finalClass,
    visibleLabel: getVisibleLabel(finalClass, profile.resultLabels),
    reasons,
    matchedRules,
    inputs: buildInputSnapshot(context, fieldDefs),
    missingFields: context.missingFields,
    evalDurationMs: Date.now() - startMs,
  }
}

// ─── Snapshot helpers ─────────────────────────────────────────────────────────

/** Builds the non-sensitive input snapshot stored in the evaluation record. */
function buildInputSnapshot(
  context: LeadEvaluationContext,
  fieldDefs: FieldDefinition[],
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {}
  for (const def of fieldDefs) {
    if (!def.isSensitive) {
      snapshot[def.key] = context.fields[def.key]
    }
  }
  return snapshot
}

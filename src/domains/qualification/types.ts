// ─── Qualification domain types ───────────────────────────────────────────────

export type QualificationClass = "hot" | "warm" | "cold" | "unqualified"
export type QualificationType = "automatic" | "manual"

/** Snapshot of the inputs used to reach a qualification decision. */
export interface QualificationInputs {
  negocioRaw: string | null
  negocioNormalized: string | null
  cityRaw: string | null
  cityCanonical: string | null
}

/** Result returned by the rule engine (pure, no side effects). */
export interface QualificationEvaluation {
  class: QualificationClass
  /** Human-readable explanation of the decision, one item per reason. */
  reasons: string[]
  inputs: QualificationInputs
}

// ─── Rule set definitions ─────────────────────────────────────────────────────
// Add new rule types here as a union member. Each type must be self-contained.

/**
 * Savaya v1: temperature-based on business presence + city priority.
 *   affirmative business + priority city  → hot
 *   affirmative business + other city     → warm
 *   no business                           → cold
 *   insufficient data                     → unqualified
 */
export interface SavayaRulesV1 {
  type: "savaya_v1"
  /**
   * Canonical city names (accent-stripped, lowercase) that count as priority.
   * E.g. ["caracas", "maracaibo", "valencia"]
   */
  priorityCities: string[]
}

export type QualificationRuleConfig = SavayaRulesV1
// Extend: export type QualificationRuleConfig = SavayaRulesV1 | OtherRuleV1

/** Type guard for the savaya_v1 rule set schema. */
export function isSavayaRulesV1(rules: unknown): rules is SavayaRulesV1 {
  if (typeof rules !== "object" || rules === null) return false
  const r = rules as Record<string, unknown>
  return r.type === "savaya_v1" && Array.isArray(r.priorityCities)
}

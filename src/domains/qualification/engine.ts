// ─── Qualification rule engine ────────────────────────────────────────────────
// Pure functions — no I/O, no side effects. Safe to import from any layer.

import { normalizeYesNo, normalizeCityCanonical } from "./normalize"
import type {
  QualificationEvaluation,
  QualificationRuleConfig,
  SavayaRulesV1,
} from "./types"

interface RawLeadInputs {
  negocioRaw: string | null | undefined
  cityRaw: string | null | undefined
}

/**
 * Entry point — dispatch to the correct rule engine by config.type.
 * Throws if the rule type is unrecognised (should never happen at runtime
 * because rule sets are validated on creation).
 */
export function evaluateLead(
  raw: RawLeadInputs,
  rules: QualificationRuleConfig,
): QualificationEvaluation {
  if (rules.type === "savaya_v1") {
    return evaluateSavayaV1(raw, rules)
  }
  // exhaustive check — cast to never so future union members surface as a TS error
  const _exhaustive: never = rules as never
  throw new Error(`Unknown rule type: ${(_exhaustive as { type: string }).type}`)
}

/**
 * Savaya v1 rule engine.
 *
 * Decision matrix:
 *   negocio = null (missing / unrecognized)  → unqualified
 *   negocio = "no"                           → cold
 *   negocio = "si" + city in priorityCities  → hot
 *   negocio = "si" + city NOT in priority    → warm
 *   negocio = "si" + no city                 → warm  (benefit of the doubt)
 */
function evaluateSavayaV1(
  raw: RawLeadInputs,
  rules: SavayaRulesV1,
): QualificationEvaluation {
  const negocioNormalized = normalizeYesNo(raw.negocioRaw ?? null)
  const cityCanonical = normalizeCityCanonical(raw.cityRaw ?? null)

  const inputs = {
    negocioRaw: raw.negocioRaw ?? null,
    negocioNormalized,
    cityRaw: raw.cityRaw ?? null,
    cityCanonical,
  }

  if (negocioNormalized === null) {
    return {
      class: "unqualified",
      reasons: [
        `Respuesta de negocio no reconocida: "${raw.negocioRaw ?? ""}"`,
      ],
      inputs,
    }
  }

  if (negocioNormalized === "no") {
    return {
      class: "cold",
      reasons: ["El lead indicó que no tiene negocio."],
      inputs,
    }
  }

  // negocioNormalized === "si"
  const prioritySet = new Set(rules.priorityCities)

  if (cityCanonical !== null && prioritySet.has(cityCanonical)) {
    return {
      class: "hot",
      reasons: [
        "El lead tiene negocio.",
        `Ciudad "${cityCanonical}" está en las ciudades prioritarias.`,
      ],
      inputs,
    }
  }

  const warmReasons = ["El lead tiene negocio."]
  if (cityCanonical === null) {
    warmReasons.push("Ciudad no especificada — se clasifica como tibio por defecto.")
  } else {
    warmReasons.push(
      `Ciudad "${cityCanonical}" no está en las ciudades prioritarias.`,
    )
  }

  return {
    class: "warm",
    reasons: warmReasons,
    inputs,
  }
}

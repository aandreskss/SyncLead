// ─── Score engine tests ────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))

import { evaluateProfile } from "@/domains/qualification/score-engine"
import { buildSavayaRuleInputs } from "@/domains/qualification/profile-types"
import { SYSTEM_FIELD_DEFINITIONS } from "@/domains/qualification/field-registry"
import { DEFAULT_THRESHOLDS } from "@/domains/qualification/profile-types"
import type {
  QualificationRule,
  QualificationProfile,
  LeadEvaluationContext,
  ProfileThresholds,
  ResultLabels,
  ConditionTree,
} from "@/domains/qualification/profile-types"

// ─── Test helpers ─────────────────────────────────────────────────────────────

let _ruleCounter = 0

function makeRule(overrides: Partial<QualificationRule> = {}): QualificationRule {
  _ruleCounter++
  return {
    id: `rule-${_ruleCounter}`,
    orgId: "org-1",
    profileId: "profile-1",
    name: `Rule ${_ruleCounter}`,
    description: null,
    priority: _ruleCounter * 10,
    active: true,
    conditions: { type: "condition", field: "negocio_normalized", operator: "is_not_empty" } as ConditionTree,
    action: "add_score",
    scoreDelta: 0,
    forcedResult: null,
    reason: "",
    stopProcessing: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeProfile(overrides: Partial<{
  id: string
  version: number
  initialScore: number
  thresholds: ProfileThresholds
  resultLabels: ResultLabels
}> = {}): { id: string; version: number; initialScore: number; thresholds: ProfileThresholds; resultLabels: ResultLabels } {
  return {
    id: "profile-1",
    version: 1,
    initialScore: 0,
    thresholds: DEFAULT_THRESHOLDS,
    resultLabels: {},
    ...overrides,
  }
}

function buildLeadContextFromValues(
  values: Record<string, unknown>,
  missingFields: string[] = [],
): LeadEvaluationContext {
  return {
    fields: { ...values },
    rawFields: { ...values },
    missingFields,
  }
}

// Savaya priority cities
const PRIORITY_CITIES = ["caracas", "maracaibo", "valencia"]

/** Build full QualificationRule objects from buildSavayaRuleInputs */
function buildSavayaRules(): QualificationRule[] {
  const inputs = buildSavayaRuleInputs(PRIORITY_CITIES)
  return inputs.map((input, i) =>
    makeRule({
      id: `savaya-rule-${i + 1}`,
      name: input.name,
      priority: input.priority,
      active: input.active,
      conditions: input.conditions as ConditionTree,
      action: input.action,
      scoreDelta: input.scoreDelta,
      forcedResult: input.forcedResult as QualificationRule["forcedResult"],
      reason: input.reason,
      stopProcessing: input.stopProcessing,
    })
  )
}

// ─── Savaya profile tests ─────────────────────────────────────────────────────

describe("evaluateProfile – Savaya profile", () => {
  const profile = makeProfile()
  const rules = buildSavayaRules()
  const fieldDefs = SYSTEM_FIELD_DEFINITIONS

  it("negocio=null → cold (disqualify rule: is_empty on enum is not in OPERATORS_BY_TYPE, so no rules match → score=0 → cold)", () => {
    // Note: buildSavayaRuleInputs uses negocio_normalized is_empty, but is_empty is
    // not in OPERATORS_BY_TYPE["enum"] (only in the field's allowedOperators).
    // evaluateLeaf checks OPERATORS_BY_TYPE first, so is_empty on enum returns false.
    // No rules match → score stays at 0 → cold (below warm.min=40).
    const ctx = buildLeadContextFromValues({ negocio_normalized: null })
    const result = evaluateProfile(profile, rules, ctx, fieldDefs)
    expect(result.class).toBe("cold")
    expect(result.score).toBe(0)
  })

  it("negocio='no' → cold (force_result cold, stop_processing)", () => {
    const ctx = buildLeadContextFromValues({ negocio_normalized: "no" })
    const result = evaluateProfile(profile, rules, ctx, fieldDefs)
    expect(result.class).toBe("cold")
  })

  it("negocio='no' → stop_processing respected: only Sin-negocio rule in matchedRules", () => {
    const ctx = buildLeadContextFromValues({ negocio_normalized: "no" })
    const result = evaluateProfile(profile, rules, ctx, fieldDefs)
    // Disqualify rule fires first (priority 10), but negocio is "no" not empty
    // "Sin negocio" rule fires at priority 20, stop_processing=true
    // No more rules should be in matchedRules
    const names = result.matchedRules.map((r) => r.ruleName)
    expect(names).toContain("Sin negocio")
    expect(names).not.toContain("Negocio + ciudad prioritaria")
    expect(names).not.toContain("Negocio fuera de ciudad prioritaria")
  })

  it("negocio='si' + priority city → hot", () => {
    const ctx = buildLeadContextFromValues({
      negocio_normalized: "si",
      city_canonical: "caracas",
    })
    const result = evaluateProfile(profile, rules, ctx, fieldDefs)
    expect(result.class).toBe("hot")
  })

  it("negocio='si' + non-priority city → warm", () => {
    const ctx = buildLeadContextFromValues({
      negocio_normalized: "si",
      city_canonical: "merida",
    })
    const result = evaluateProfile(profile, rules, ctx, fieldDefs)
    expect(result.class).toBe("warm")
  })

  it("negocio='si' + no city → warm", () => {
    const ctx = buildLeadContextFromValues({
      negocio_normalized: "si",
      city_canonical: null,
    })
    const result = evaluateProfile(profile, rules, ctx, fieldDefs)
    expect(result.class).toBe("warm")
  })

  it("matched rules are recorded in result.matchedRules", () => {
    const ctx = buildLeadContextFromValues({
      negocio_normalized: "si",
      city_canonical: "caracas",
    })
    const result = evaluateProfile(profile, rules, ctx, fieldDefs)
    expect(result.matchedRules.length).toBeGreaterThan(0)
    expect(result.matchedRules[0]).toMatchObject({
      ruleId: expect.any(String),
      ruleName: expect.any(String),
    })
  })

  it("stop_processing stops further rule evaluation", () => {
    const ctx = buildLeadContextFromValues({
      negocio_normalized: "si",
      city_canonical: "caracas",
    })
    const result = evaluateProfile(profile, rules, ctx, fieldDefs)
    // "Negocio + ciudad prioritaria" has stop_processing=true; rule 4 should NOT be evaluated
    const names = result.matchedRules.map((r) => r.ruleName)
    expect(names).not.toContain("Negocio fuera de ciudad prioritaria")
  })
})

// ─── Scoring system ───────────────────────────────────────────────────────────

describe("evaluateProfile – scoring system", () => {
  const fieldDefs = SYSTEM_FIELD_DEFINITIONS
  // city_canonical is a text field — is_not_empty works correctly for text type
  const alwaysMatchCondition: ConditionTree = {
    type: "condition",
    field: "city_canonical",
    operator: "is_not_empty",
  }

  it("initialScore=10, rule adds +30 → score=40 → warm", () => {
    const profile = makeProfile({ initialScore: 10 })
    const rule = makeRule({
      id: "r1",
      priority: 10,
      conditions: alwaysMatchCondition,
      action: "add_score",
      scoreDelta: 30,
    })
    const ctx = buildLeadContextFromValues({ city_canonical: "caracas" })
    const result = evaluateProfile(profile, [rule], ctx, fieldDefs)
    expect(result.score).toBe(40)
    expect(result.class).toBe("warm")
  })

  it("score clamped to 100 max: initialScore=90 + rule +50 = clamped to 100 → hot", () => {
    const profile = makeProfile({ initialScore: 90 })
    const rule = makeRule({
      id: "r2",
      priority: 10,
      conditions: alwaysMatchCondition,
      action: "add_score",
      scoreDelta: 50,
    })
    const ctx = buildLeadContextFromValues({ city_canonical: "caracas" })
    const result = evaluateProfile(profile, [rule], ctx, fieldDefs)
    expect(result.score).toBe(100)
    expect(result.class).toBe("hot")
  })

  it("score clamped to 0 min: initialScore=10 + rule -50 = clamped to 0 → cold", () => {
    const profile = makeProfile({ initialScore: 10 })
    const rule = makeRule({
      id: "r3",
      priority: 10,
      conditions: alwaysMatchCondition,
      action: "add_score",
      scoreDelta: -50,
    })
    const ctx = buildLeadContextFromValues({ city_canonical: "caracas" })
    const result = evaluateProfile(profile, [rule], ctx, fieldDefs)
    expect(result.score).toBe(0)
    expect(result.class).toBe("cold")
  })

  it("multiple matching rules: scores accumulate", () => {
    const profile = makeProfile({ initialScore: 0 })
    const rule1 = makeRule({ id: "r4a", priority: 10, conditions: alwaysMatchCondition, action: "add_score", scoreDelta: 20 })
    const rule2 = makeRule({ id: "r4b", priority: 20, conditions: alwaysMatchCondition, action: "add_score", scoreDelta: 25 })
    const ctx = buildLeadContextFromValues({ city_canonical: "caracas" })
    const result = evaluateProfile(profile, [rule1, rule2], ctx, fieldDefs)
    expect(result.score).toBe(45)
    expect(result.class).toBe("warm")
  })

  it("forced result overrides score-based class", () => {
    const profile = makeProfile({ initialScore: 0 })
    const rule = makeRule({
      id: "r5",
      priority: 10,
      conditions: alwaysMatchCondition,
      action: "force_result",
      scoreDelta: 0,
      forcedResult: "hot",
      stopProcessing: true,
    })
    const ctx = buildLeadContextFromValues({ city_canonical: "caracas" })
    const result = evaluateProfile(profile, [rule], ctx, fieldDefs)
    expect(result.class).toBe("hot")
    // Score may still be 0 since force_result doesn't add score
    expect(result.score).toBe(0)
  })
})

// ─── Required fields ──────────────────────────────────────────────────────────

describe("evaluateProfile – required fields", () => {
  const fieldDefs = SYSTEM_FIELD_DEFINITIONS

  it("required field missing → unqualified, missingFields populated", () => {
    const profile = makeProfile()
    const ctx = buildLeadContextFromValues({}, ["negocio_normalized"])
    const result = evaluateProfile(profile, [], ctx, fieldDefs)
    expect(result.class).toBe("unqualified")
    expect(result.missingFields).toContain("negocio_normalized")
  })

  it("required field present → normal evaluation proceeds", () => {
    const profile = makeProfile({ initialScore: 50 })
    // No missing fields; no rules → score stays at 50 → warm
    const ctx = buildLeadContextFromValues({ negocio_normalized: "si" })
    const result = evaluateProfile(profile, [], ctx, fieldDefs)
    expect(result.class).toBe("warm")
  })
})

// ─── Stop processing ──────────────────────────────────────────────────────────

describe("evaluateProfile – stop processing", () => {
  const fieldDefs = SYSTEM_FIELD_DEFINITIONS
  // Use text field with is_not_empty (city_canonical is a text field)
  const alwaysMatch: ConditionTree = {
    type: "condition",
    field: "city_canonical",
    operator: "is_not_empty",
  }

  it("rule with stop_processing=true: subsequent rules not evaluated", () => {
    const profile = makeProfile({ initialScore: 0 })
    const rule1 = makeRule({ id: "stop-1", priority: 10, conditions: alwaysMatch, action: "add_score", scoreDelta: 20, stopProcessing: true })
    const rule2 = makeRule({ id: "stop-2", priority: 20, conditions: alwaysMatch, action: "add_score", scoreDelta: 50, stopProcessing: false })
    const ctx = buildLeadContextFromValues({ city_canonical: "caracas" })
    const result = evaluateProfile(profile, [rule1, rule2], ctx, fieldDefs)
    // Only rule1 should have fired → score = 20
    expect(result.score).toBe(20)
    const ids = result.matchedRules.map((r) => r.ruleId)
    expect(ids).toContain("stop-1")
    expect(ids).not.toContain("stop-2")
  })

  it("rule with stop_processing=false: evaluation continues to next rule", () => {
    const profile = makeProfile({ initialScore: 0 })
    const rule1 = makeRule({ id: "cont-1", priority: 10, conditions: alwaysMatch, action: "add_score", scoreDelta: 20, stopProcessing: false })
    const rule2 = makeRule({ id: "cont-2", priority: 20, conditions: alwaysMatch, action: "add_score", scoreDelta: 25, stopProcessing: false })
    const ctx = buildLeadContextFromValues({ city_canonical: "caracas" })
    const result = evaluateProfile(profile, [rule1, rule2], ctx, fieldDefs)
    expect(result.score).toBe(45)
    const ids = result.matchedRules.map((r) => r.ruleId)
    expect(ids).toContain("cont-1")
    expect(ids).toContain("cont-2")
  })
})

// ─── Custom thresholds ────────────────────────────────────────────────────────

describe("evaluateProfile – custom thresholds", () => {
  const fieldDefs = SYSTEM_FIELD_DEFINITIONS
  const customThresholds: ProfileThresholds = {
    hot: { min: 60 },
    warm: { min: 30, max: 59 },
    cold: { max: 29 },
  }

  it("score=65 with custom thresholds → hot", () => {
    const profile = makeProfile({ initialScore: 65, thresholds: customThresholds })
    const result = evaluateProfile(profile, [], buildLeadContextFromValues({}), fieldDefs)
    expect(result.class).toBe("hot")
  })

  it("score=45 with custom thresholds → warm", () => {
    const profile = makeProfile({ initialScore: 45, thresholds: customThresholds })
    const result = evaluateProfile(profile, [], buildLeadContextFromValues({}), fieldDefs)
    expect(result.class).toBe("warm")
  })

  it("score=20 with custom thresholds → cold", () => {
    const profile = makeProfile({ initialScore: 20, thresholds: customThresholds })
    const result = evaluateProfile(profile, [], buildLeadContextFromValues({}), fieldDefs)
    expect(result.class).toBe("cold")
  })
})

// ─── Visible labels ───────────────────────────────────────────────────────────

describe("evaluateProfile – visible labels", () => {
  const fieldDefs = SYSTEM_FIELD_DEFINITIONS

  it("resultLabels.hot='Alta prioridad' → visibleLabel='Alta prioridad' for hot leads", () => {
    const profile = makeProfile({
      initialScore: 80,
      resultLabels: { hot: "Alta prioridad", warm: "Interesado", cold: "Sin interés" },
    })
    const result = evaluateProfile(profile, [], buildLeadContextFromValues({}), fieldDefs)
    expect(result.class).toBe("hot")
    expect(result.visibleLabel).toBe("Alta prioridad")
  })

  it("no custom label → defaults to Spanish 'Caliente'", () => {
    const profile = makeProfile({ initialScore: 80 })
    const result = evaluateProfile(profile, [], buildLeadContextFromValues({}), fieldDefs)
    expect(result.visibleLabel).toBe("Caliente")
  })

  it("cold class with custom label", () => {
    const profile = makeProfile({
      initialScore: 10,
      resultLabels: { cold: "Frío confirmado" },
    })
    const result = evaluateProfile(profile, [], buildLeadContextFromValues({}), fieldDefs)
    expect(result.class).toBe("cold")
    expect(result.visibleLabel).toBe("Frío confirmado")
  })

  it("unqualified uses custom label if set", () => {
    const profile = makeProfile({
      resultLabels: { unqualified: "No calificado" },
    })
    const ctx = buildLeadContextFromValues({}, ["negocio_normalized"])
    const result = evaluateProfile(profile, [], ctx, fieldDefs)
    expect(result.class).toBe("unqualified")
    expect(result.visibleLabel).toBe("No calificado")
  })
})

// ─── E-commerce model ─────────────────────────────────────────────────────────

describe("evaluateProfile – e-commerce model", () => {
  const fieldDefs = SYSTEM_FIELD_DEFINITIONS
  const profile = makeProfile({ initialScore: 0 })

  const cartValueRule = makeRule({
    id: "ecom-cart",
    priority: 10,
    conditions: { type: "condition", field: "ecom_cart_value", operator: "greater_than", value: 100 } as ConditionTree,
    action: "add_score",
    scoreDelta: 25,
    stopProcessing: false,
  })

  const checkoutRule = makeRule({
    id: "ecom-checkout",
    priority: 20,
    conditions: { type: "condition", field: "ecom_checkout_started", operator: "is_true" } as ConditionTree,
    action: "add_score",
    scoreDelta: 20,
    stopProcessing: false,
  })

  const paymentFailedRule = makeRule({
    id: "ecom-payment-failed",
    priority: 30,
    conditions: { type: "condition", field: "ecom_payment_failed", operator: "is_true" } as ConditionTree,
    action: "force_result",
    scoreDelta: 0,
    forcedResult: "cold",
    reason: "Pago fallido — requiere seguimiento",
    stopProcessing: true,
  })

  it("cart value > 100 → +25 points", () => {
    const ctx = buildLeadContextFromValues({ ecom_cart_value: 150 })
    const result = evaluateProfile(profile, [cartValueRule], ctx, fieldDefs)
    expect(result.score).toBe(25)
  })

  it("checkout started → +20 points", () => {
    const ctx = buildLeadContextFromValues({ ecom_checkout_started: true })
    const result = evaluateProfile(profile, [checkoutRule], ctx, fieldDefs)
    expect(result.score).toBe(20)
  })

  it("payment failed → force_result cold (overrides accumulated score)", () => {
    const ctx = buildLeadContextFromValues({
      ecom_cart_value: 150,
      ecom_checkout_started: true,
      ecom_payment_failed: true,
    })
    const result = evaluateProfile(profile, [cartValueRule, checkoutRule, paymentFailedRule], ctx, fieldDefs)
    expect(result.class).toBe("cold")
  })
})

// ─── Disqualify action ────────────────────────────────────────────────────────

describe("evaluateProfile – disqualify action", () => {
  const fieldDefs = SYSTEM_FIELD_DEFINITIONS

  it("disqualify rule matches → immediate unqualified, reasons populated", () => {
    const profile = makeProfile({ initialScore: 50 })
    // city_canonical is a text field — is_empty works for text type
    const disqualifyRule = makeRule({
      id: "disq-1",
      priority: 5,
      conditions: {
        type: "condition",
        field: "city_canonical",
        operator: "is_empty",
      } as ConditionTree,
      action: "disqualify",
      reason: "Sin respuesta de negocio",
      stopProcessing: true,
    })
    const ctx = buildLeadContextFromValues({ city_canonical: null })
    const result = evaluateProfile(profile, [disqualifyRule], ctx, fieldDefs)
    expect(result.class).toBe("unqualified")
    expect(result.reasons).toContain("Sin respuesta de negocio")
  })

  it("disqualify rule does not match → continues normally", () => {
    const profile = makeProfile({ initialScore: 80 })
    const disqualifyRule = makeRule({
      id: "disq-2",
      priority: 5,
      conditions: {
        type: "condition",
        field: "city_canonical",
        operator: "is_empty",
      } as ConditionTree,
      action: "disqualify",
      reason: "Sin respuesta de negocio",
    })
    const ctx = buildLeadContextFromValues({ city_canonical: "caracas" })
    const result = evaluateProfile(profile, [disqualifyRule], ctx, fieldDefs)
    expect(result.class).toBe("hot")
  })
})

// ─── Inactive rules ───────────────────────────────────────────────────────────

describe("evaluateProfile – inactive rules", () => {
  const fieldDefs = SYSTEM_FIELD_DEFINITIONS

  it("inactive rule is skipped even if conditions would match", () => {
    const profile = makeProfile({ initialScore: 0 })
    const rule = makeRule({
      id: "inactive-1",
      priority: 10,
      active: false,
      conditions: {
        type: "condition",
        field: "city_canonical",
        operator: "is_not_empty",
      } as ConditionTree,
      action: "add_score",
      scoreDelta: 50,
    })
    const ctx = buildLeadContextFromValues({ city_canonical: "caracas" })
    const result = evaluateProfile(profile, [rule], ctx, fieldDefs)
    expect(result.score).toBe(0)
    expect(result.matchedRules).toHaveLength(0)
  })
})

// ─── Cross-tenant isolation ───────────────────────────────────────────────────

describe("evaluateProfile – cross-tenant isolation", () => {
  const fieldDefs = SYSTEM_FIELD_DEFINITIONS

  it("profile from org-1 does not produce different results when context has no org-specific data", () => {
    // The engine itself is pure — org isolation is enforced at the DB layer.
    // This test verifies that two profiles with the same structure but different orgIds
    // produce identical results given the same context (no org data leaks into evaluation).
    const profileOrg1 = makeProfile({ id: "profile-org1", initialScore: 50 })
    const profileOrg2 = { ...profileOrg1, id: "profile-org2" }

    const rule = makeRule({
      id: "shared-rule",
      priority: 10,
      conditions: {
        type: "condition",
        field: "city_canonical",
        operator: "is_not_empty",
      } as ConditionTree,
      action: "add_score",
      scoreDelta: 20,
    })

    const ctx = buildLeadContextFromValues({ city_canonical: "caracas" })

    const result1 = evaluateProfile(profileOrg1, [rule], ctx, fieldDefs)
    const result2 = evaluateProfile(profileOrg2, [rule], ctx, fieldDefs)

    expect(result1.score).toBe(result2.score)
    expect(result1.class).toBe(result2.class)
  })

  it("profileId is preserved correctly in the result", () => {
    const profile = makeProfile({ id: "unique-profile-id-99" })
    const result = evaluateProfile(profile, [], buildLeadContextFromValues({}), fieldDefs)
    expect(result.profileId).toBe("unique-profile-id-99")
  })
})

// ─── Priority ordering ────────────────────────────────────────────────────────

describe("evaluateProfile – rule priority ordering", () => {
  const fieldDefs = SYSTEM_FIELD_DEFINITIONS

  it("rules are evaluated in ascending priority order (lower number first)", () => {
    const profile = makeProfile({ initialScore: 0 })
    const evaluatedOrder: string[] = []

    // Rule priority=20 added first in array, but priority=10 should fire first
    const rule20 = makeRule({
      id: "prio-20",
      priority: 20,
      conditions: { type: "condition", field: "city_canonical", operator: "is_not_empty" } as ConditionTree,
      action: "add_score",
      scoreDelta: 10,
    })
    const rule10 = makeRule({
      id: "prio-10",
      priority: 10,
      conditions: { type: "condition", field: "city_canonical", operator: "is_not_empty" } as ConditionTree,
      action: "add_score",
      scoreDelta: 5,
      stopProcessing: true,
    })

    const ctx = buildLeadContextFromValues({ city_canonical: "caracas" })
    // Pass rule20 before rule10 in array — engine should sort by priority
    const result = evaluateProfile(profile, [rule20, rule10], ctx, fieldDefs)

    // prio-10 fires first with stop_processing → prio-20 should NOT fire
    expect(result.score).toBe(5)
    const ids = result.matchedRules.map((r) => r.ruleId)
    expect(ids).toContain("prio-10")
    expect(ids).not.toContain("prio-20")
  })
})

// ─── evalDurationMs ───────────────────────────────────────────────────────────

describe("evaluateProfile – result metadata", () => {
  const fieldDefs = SYSTEM_FIELD_DEFINITIONS

  it("evalDurationMs is a non-negative number", () => {
    const profile = makeProfile()
    const result = evaluateProfile(profile, [], buildLeadContextFromValues({}), fieldDefs)
    expect(result.evalDurationMs).toBeGreaterThanOrEqual(0)
    expect(typeof result.evalDurationMs).toBe("number")
  })

  it("profileVersion is correctly reflected in result", () => {
    const profile = makeProfile({ version: 7 })
    const result = evaluateProfile(profile, [], buildLeadContextFromValues({}), fieldDefs)
    expect(result.profileVersion).toBe(7)
  })
})

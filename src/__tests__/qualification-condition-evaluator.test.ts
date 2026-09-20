// ─── Condition evaluator tests ────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))

import {
  evaluateLeaf,
  evaluateGroup,
  evaluateConditionTree,
} from "@/domains/qualification/condition-evaluator"
import { SYSTEM_FIELD_DEFINITIONS } from "@/domains/qualification/field-registry"
import type {
  ConditionLeaf,
  ConditionGroup,
  ConditionTree,
  FieldDefinition,
  LeadEvaluationContext,
} from "@/domains/qualification/profile-types"

// ─── Test helpers ─────────────────────────────────────────────────────────────

function buildLeadContextFromValues(
  values: Record<string, unknown>,
): LeadEvaluationContext {
  return {
    fields: { ...values },
    rawFields: { ...values },
    missingFields: [],
  }
}

function makeFieldDefs(
  entries: Array<{ key: string; dataType: FieldDefinition["dataType"] }>,
): Map<string, FieldDefinition> {
  const map = new Map<string, FieldDefinition>()
  for (const e of entries) {
    const sys = SYSTEM_FIELD_DEFINITIONS.find((f) => f.key === e.key)
    if (sys) {
      map.set(e.key, sys)
    } else {
      // synthesize a minimal FieldDefinition for custom fields used in tests
      map.set(e.key, {
        id: e.key,
        orgId: null,
        clientId: null,
        key: e.key,
        label: e.key,
        dataType: e.dataType,
        source: "custom",
        category: "custom",
        isSensitive: false,
        allowedOperators: [],
        normalization: [],
        enumOptions: [],
        isRequiredForEval: false,
      } as FieldDefinition)
    }
  }
  return map
}

/** Build the system field map (all SYSTEM_FIELD_DEFINITIONS keyed by key). */
const SYS_MAP = new Map<string, FieldDefinition>(
  SYSTEM_FIELD_DEFINITIONS.map((f) => [f.key, f]),
)

// ─── evaluateLeaf — Text operators ───────────────────────────────────────────

describe("evaluateLeaf – text operators", () => {
  const leaf = (operator: string, value?: unknown, value2?: unknown): ConditionLeaf => ({
    type: "condition",
    field: "name",
    operator: operator as ConditionLeaf["operator"],
    value: value as ConditionLeaf["value"],
    value2: value2 as ConditionLeaf["value2"],
  })

  it("equals: case-insensitive match", () => {
    expect(evaluateLeaf(leaf("equals", "hello"), "Hello", "text")).toBe(true)
  })

  it("equals: mismatch returns false", () => {
    expect(evaluateLeaf(leaf("equals", "hello"), "world", "text")).toBe(false)
  })

  it("not_equals: different values return true", () => {
    expect(evaluateLeaf(leaf("not_equals", "hello"), "world", "text")).toBe(true)
  })

  it("not_equals: same value returns false", () => {
    expect(evaluateLeaf(leaf("not_equals", "HELLO"), "hello", "text")).toBe(false)
  })

  it("contains: substring match", () => {
    expect(evaluateLeaf(leaf("contains", "world"), "Hello World", "text")).toBe(true)
  })

  it("not_contains: absent substring returns true", () => {
    expect(evaluateLeaf(leaf("not_contains", "xyz"), "Hello World", "text")).toBe(true)
  })

  it("starts_with: correct prefix", () => {
    expect(evaluateLeaf(leaf("starts_with", "hel"), "hello", "text")).toBe(true)
  })

  it("ends_with: correct suffix", () => {
    expect(evaluateLeaf(leaf("ends_with", "rld"), "world", "text")).toBe(true)
  })

  it("is_empty: null returns true", () => {
    expect(evaluateLeaf(leaf("is_empty"), null, "text")).toBe(true)
  })

  it("is_empty: empty string returns true", () => {
    expect(evaluateLeaf(leaf("is_empty"), "", "text")).toBe(true)
  })

  it("is_empty: whitespace-only string returns true", () => {
    expect(evaluateLeaf(leaf("is_empty"), "   ", "text")).toBe(true)
  })

  it("is_empty: non-empty string returns false", () => {
    expect(evaluateLeaf(leaf("is_empty"), "hello", "text")).toBe(false)
  })

  it("is_not_empty: non-empty string returns true", () => {
    expect(evaluateLeaf(leaf("is_not_empty"), "hello", "text")).toBe(true)
  })

  it("is_not_empty: null returns false", () => {
    expect(evaluateLeaf(leaf("is_not_empty"), null, "text")).toBe(false)
  })

  it("in_list: value in array (case-insensitive)", () => {
    expect(evaluateLeaf(leaf("in_list", ["Alpha", "Beta"]), "alpha", "text")).toBe(true)
  })

  it("not_in_list: value absent from array", () => {
    expect(evaluateLeaf(leaf("not_in_list", ["alpha", "beta"]), "gamma", "text")).toBe(true)
  })

  it("not_in_list: value present returns false", () => {
    expect(evaluateLeaf(leaf("not_in_list", ["alpha", "beta"]), "ALPHA", "text")).toBe(false)
  })
})

// ─── evaluateLeaf — Number operators ─────────────────────────────────────────

describe("evaluateLeaf – number operators", () => {
  const leaf = (operator: string, value?: unknown, value2?: unknown): ConditionLeaf => ({
    type: "condition",
    field: "ecom_cart_value",
    operator: operator as ConditionLeaf["operator"],
    value: value as ConditionLeaf["value"],
    value2: value2 as ConditionLeaf["value2"],
  })

  it("equals: exact number match", () => {
    expect(evaluateLeaf(leaf("equals", 42), 42, "number")).toBe(true)
  })

  it("not_equals: different numbers", () => {
    expect(evaluateLeaf(leaf("not_equals", 42), 99, "number")).toBe(true)
  })

  it("greater_than: value > threshold", () => {
    expect(evaluateLeaf(leaf("greater_than", 100), 150, "number")).toBe(true)
  })

  it("greater_than: equal is false", () => {
    expect(evaluateLeaf(leaf("greater_than", 100), 100, "number")).toBe(false)
  })

  it("greater_than_or_equal: equal returns true", () => {
    expect(evaluateLeaf(leaf("greater_than_or_equal", 100), 100, "number")).toBe(true)
  })

  it("less_than: value < threshold", () => {
    expect(evaluateLeaf(leaf("less_than", 100), 50, "number")).toBe(true)
  })

  it("less_than_or_equal: equal returns true", () => {
    expect(evaluateLeaf(leaf("less_than_or_equal", 100), 100, "number")).toBe(true)
  })

  it("between: inclusive on both ends — lower bound", () => {
    expect(evaluateLeaf(leaf("between", 10, 50), 10, "number")).toBe(true)
  })

  it("between: inclusive on both ends — upper bound", () => {
    expect(evaluateLeaf(leaf("between", 10, 50), 50, "number")).toBe(true)
  })

  it("between: value in range", () => {
    expect(evaluateLeaf(leaf("between", 10, 50), 30, "number")).toBe(true)
  })

  it("between: value out of range returns false", () => {
    expect(evaluateLeaf(leaf("between", 10, 50), 51, "number")).toBe(false)
  })

  it("is_empty: null returns true", () => {
    expect(evaluateLeaf(leaf("is_empty"), null, "number")).toBe(true)
  })

  it("is_not_empty: 0 returns true (0 is a valid number)", () => {
    expect(evaluateLeaf(leaf("is_not_empty"), 0, "number")).toBe(true)
  })

  it("is_not_empty: null returns false", () => {
    expect(evaluateLeaf(leaf("is_not_empty"), null, "number")).toBe(false)
  })
})

// ─── evaluateLeaf — Boolean operators ────────────────────────────────────────

describe("evaluateLeaf – boolean operators", () => {
  const leaf = (operator: string): ConditionLeaf => ({
    type: "condition",
    field: "ecom_checkout_started",
    operator: operator as ConditionLeaf["operator"],
  })

  it("is_true: true → true", () => {
    expect(evaluateLeaf(leaf("is_true"), true, "boolean")).toBe(true)
  })

  it("is_true: false → false", () => {
    expect(evaluateLeaf(leaf("is_true"), false, "boolean")).toBe(false)
  })

  it("is_false: false → true", () => {
    expect(evaluateLeaf(leaf("is_false"), false, "boolean")).toBe(true)
  })

  it("is_false: true → false", () => {
    expect(evaluateLeaf(leaf("is_false"), true, "boolean")).toBe(false)
  })

  it("is_unknown: null → true", () => {
    expect(evaluateLeaf(leaf("is_unknown"), null, "boolean")).toBe(true)
  })

  it("is_unknown: undefined → true", () => {
    expect(evaluateLeaf(leaf("is_unknown"), undefined, "boolean")).toBe(true)
  })

  it("is_unknown: false → false", () => {
    expect(evaluateLeaf(leaf("is_unknown"), false, "boolean")).toBe(false)
  })

  it("is_unknown: true → false", () => {
    expect(evaluateLeaf(leaf("is_unknown"), true, "boolean")).toBe(false)
  })
})

// ─── evaluateLeaf — Enum operators ───────────────────────────────────────────

describe("evaluateLeaf – enum operators", () => {
  const leaf = (operator: string, value?: unknown): ConditionLeaf => ({
    type: "condition",
    field: "negocio_normalized",
    operator: operator as ConditionLeaf["operator"],
    value: value as ConditionLeaf["value"],
  })

  it("equals: case-insensitive match", () => {
    expect(evaluateLeaf(leaf("equals", "SI"), "si", "enum")).toBe(true)
  })

  it("equals: mismatch returns false", () => {
    expect(evaluateLeaf(leaf("equals", "si"), "no", "enum")).toBe(false)
  })

  it("in_list: value is one of the options", () => {
    expect(evaluateLeaf(leaf("in_list", ["si", "no"]), "si", "enum")).toBe(true)
  })

  it("in_list: value not in options returns false", () => {
    expect(evaluateLeaf(leaf("in_list", ["si"]), "no", "enum")).toBe(false)
  })
})

// ─── evaluateLeaf — Multi-select operators ────────────────────────────────────

describe("evaluateLeaf – multi-select operators", () => {
  const msLeaf = (operator: string, value: unknown): ConditionLeaf => ({
    type: "condition",
    field: "tags",
    operator: operator as ConditionLeaf["operator"],
    value: value as ConditionLeaf["value"],
  })

  it("contains_any: [a,b] contains_any [b,c] → true", () => {
    expect(evaluateLeaf(msLeaf("contains_any", ["b", "c"]), ["a", "b"], "multi_select")).toBe(true)
  })

  it("contains_any: no overlap → false", () => {
    expect(evaluateLeaf(msLeaf("contains_any", ["x", "y"]), ["a", "b"], "multi_select")).toBe(false)
  })

  it("contains_all: [a,b,c] contains_all [a,b] → true", () => {
    expect(evaluateLeaf(msLeaf("contains_all", ["a", "b"]), ["a", "b", "c"], "multi_select")).toBe(true)
  })

  it("contains_all: missing one element → false", () => {
    expect(evaluateLeaf(msLeaf("contains_all", ["a", "d"]), ["a", "b", "c"], "multi_select")).toBe(false)
  })
})

// ─── evaluateGroup — Group logic ─────────────────────────────────────────────

describe("evaluateGroup – group logic", () => {
  const ctx = buildLeadContextFromValues({
    negocio_normalized: "si",
    city_canonical: "caracas",
    ecom_cart_value: 150,
  })

  const allGroup: ConditionGroup = {
    type: "group",
    operator: "all",
    conditions: [
      { type: "condition", field: "negocio_normalized", operator: "equals", value: "si" },
      { type: "condition", field: "city_canonical", operator: "equals", value: "caracas" },
    ],
  }

  const anyGroup: ConditionGroup = {
    type: "group",
    operator: "any",
    conditions: [
      { type: "condition", field: "negocio_normalized", operator: "equals", value: "no" },
      { type: "condition", field: "city_canonical", operator: "equals", value: "caracas" },
    ],
  }

  const noneGroup: ConditionGroup = {
    type: "group",
    operator: "none",
    conditions: [
      { type: "condition", field: "negocio_normalized", operator: "equals", value: "no" },
      { type: "condition", field: "city_canonical", operator: "equals", value: "maracaibo" },
    ],
  }

  it("all group: all conditions match → true", () => {
    expect(evaluateGroup(allGroup, ctx, SYS_MAP)).toBe(true)
  })

  it("all group: one condition fails → false", () => {
    const failCtx = buildLeadContextFromValues({ negocio_normalized: "si", city_canonical: "valencia" })
    const group: ConditionGroup = {
      type: "group",
      operator: "all",
      conditions: [
        { type: "condition", field: "negocio_normalized", operator: "equals", value: "si" },
        { type: "condition", field: "city_canonical", operator: "equals", value: "caracas" },
      ],
    }
    expect(evaluateGroup(group, failCtx, SYS_MAP)).toBe(false)
  })

  it("any group: at least one matches → true", () => {
    expect(evaluateGroup(anyGroup, ctx, SYS_MAP)).toBe(true)
  })

  it("any group: none match → false", () => {
    const failCtx = buildLeadContextFromValues({ negocio_normalized: "si", city_canonical: "bogota" })
    const group: ConditionGroup = {
      type: "group",
      operator: "any",
      conditions: [
        { type: "condition", field: "negocio_normalized", operator: "equals", value: "no" },
        { type: "condition", field: "city_canonical", operator: "equals", value: "caracas" },
      ],
    }
    expect(evaluateGroup(group, failCtx, SYS_MAP)).toBe(false)
  })

  it("none group: none match → true", () => {
    expect(evaluateGroup(noneGroup, ctx, SYS_MAP)).toBe(true)
  })

  it("none group: one matches → false", () => {
    const matchCtx = buildLeadContextFromValues({ city_canonical: "maracaibo" })
    expect(evaluateGroup(noneGroup, matchCtx, SYS_MAP)).toBe(false)
  })
})

// ─── evaluateConditionTree — Nested groups ────────────────────────────────────

describe("evaluateConditionTree – nested groups (2 levels)", () => {
  const ctx = buildLeadContextFromValues({
    negocio_normalized: "si",
    city_canonical: "caracas",
    ecom_cart_value: 150,
  })

  it("nested all-inside-any group resolves correctly (true path)", () => {
    const tree: ConditionTree = {
      type: "group",
      operator: "any",
      conditions: [
        {
          type: "group",
          operator: "all",
          conditions: [
            { type: "condition", field: "negocio_normalized", operator: "equals", value: "si" },
            { type: "condition", field: "city_canonical", operator: "equals", value: "caracas" },
          ],
        },
        { type: "condition", field: "ecom_cart_value", operator: "greater_than", value: 500 },
      ],
    }
    expect(evaluateConditionTree(tree, ctx, SYS_MAP)).toBe(true)
  })

  it("nested all-inside-any group resolves correctly (false path)", () => {
    const tree: ConditionTree = {
      type: "group",
      operator: "any",
      conditions: [
        {
          type: "group",
          operator: "all",
          conditions: [
            { type: "condition", field: "negocio_normalized", operator: "equals", value: "no" },
            { type: "condition", field: "city_canonical", operator: "equals", value: "caracas" },
          ],
        },
        { type: "condition", field: "ecom_cart_value", operator: "greater_than", value: 500 },
      ],
    }
    expect(evaluateConditionTree(tree, ctx, SYS_MAP)).toBe(false)
  })
})

// ─── evaluateConditionTree — Unknown field ────────────────────────────────────

describe("evaluateConditionTree – unknown field handling", () => {
  const ctx = buildLeadContextFromValues({ negocio_normalized: "si" })

  it("unknown field with is_empty returns true", () => {
    const leaf: ConditionLeaf = {
      type: "condition",
      field: "unknown_field_xyz",
      operator: "is_empty",
    }
    expect(evaluateConditionTree(leaf, ctx, SYS_MAP)).toBe(true)
  })

  it("unknown field with equals returns false", () => {
    const leaf: ConditionLeaf = {
      type: "condition",
      field: "unknown_field_xyz",
      operator: "equals",
      value: "something",
    }
    expect(evaluateConditionTree(leaf, ctx, SYS_MAP)).toBe(false)
  })
})

// ─── Business model fixtures ──────────────────────────────────────────────────

describe("Business model fixtures – Savaya (local shoe brand)", () => {
  const SAVAYA_CONTEXT = buildLeadContextFromValues({
    negocio_normalized: "si",
    city_canonical: "caracas",
  })

  it("negocio=si + city=caracas → negocio_normalized equals 'si' is true", () => {
    const leaf: ConditionLeaf = {
      type: "condition",
      field: "negocio_normalized",
      operator: "equals",
      value: "si",
    }
    expect(evaluateConditionTree(leaf, SAVAYA_CONTEXT, SYS_MAP)).toBe(true)
  })

  it("city in priority list [caracas, maracaibo] → in_list matches", () => {
    const leaf: ConditionLeaf = {
      type: "condition",
      field: "city_canonical",
      operator: "in_list",
      value: ["caracas", "maracaibo", "valencia"],
    }
    expect(evaluateConditionTree(leaf, SAVAYA_CONTEXT, SYS_MAP)).toBe(true)
  })

  it("city=null → is_empty returns true (text field supports is_empty operator)", () => {
    // negocio_normalized is enum type; is_empty is not in OPERATORS_BY_TYPE["enum"].
    // Use city_canonical (text) which fully supports is_empty.
    const nullCtx = buildLeadContextFromValues({ city_canonical: null })
    const leaf: ConditionLeaf = {
      type: "condition",
      field: "city_canonical",
      operator: "is_empty",
    }
    expect(evaluateConditionTree(leaf, nullCtx, SYS_MAP)).toBe(true)
  })
})

describe("Business model fixtures – E-commerce (cart recovery)", () => {
  const ECOM_CONTEXT = buildLeadContextFromValues({
    ecom_cart_value: 150,
    ecom_checkout_started: true,
    ecom_cart_abandoned: true,
    ecom_payment_failed: false,
  })

  it("cart value > 100 → true", () => {
    const leaf: ConditionLeaf = {
      type: "condition",
      field: "ecom_cart_value",
      operator: "greater_than",
      value: 100,
    }
    expect(evaluateConditionTree(leaf, ECOM_CONTEXT, SYS_MAP)).toBe(true)
  })

  it("checkout started = true → is_true matches", () => {
    const leaf: ConditionLeaf = {
      type: "condition",
      field: "ecom_checkout_started",
      operator: "is_true",
    }
    expect(evaluateConditionTree(leaf, ECOM_CONTEXT, SYS_MAP)).toBe(true)
  })

  it("payment failed = false → is_false matches", () => {
    const leaf: ConditionLeaf = {
      type: "condition",
      field: "ecom_payment_failed",
      operator: "is_false",
    }
    expect(evaluateConditionTree(leaf, ECOM_CONTEXT, SYS_MAP)).toBe(true)
  })

  it("all-group: high-value abandoned cart detection", () => {
    const tree: ConditionTree = {
      type: "group",
      operator: "all",
      conditions: [
        { type: "condition", field: "ecom_cart_value", operator: "greater_than", value: 100 },
        { type: "condition", field: "ecom_checkout_started", operator: "is_true" },
        { type: "condition", field: "ecom_cart_abandoned", operator: "is_true" },
      ],
    }
    expect(evaluateConditionTree(tree, ECOM_CONTEXT, SYS_MAP)).toBe(true)
  })
})

describe("Business model fixtures – B2B (platform + UTM source)", () => {
  const B2B_CONTEXT = buildLeadContextFromValues({
    platform: "facebook",
    utm_source: "meta",
    utm_medium: "cpc",
    device: "desktop",
  })

  it("platform equals 'facebook'", () => {
    const leaf: ConditionLeaf = {
      type: "condition",
      field: "platform",
      operator: "equals",
      value: "facebook",
    }
    expect(evaluateConditionTree(leaf, B2B_CONTEXT, SYS_MAP)).toBe(true)
  })

  it("device = desktop → business qualifier", () => {
    const leaf: ConditionLeaf = {
      type: "condition",
      field: "device",
      operator: "equals",
      value: "desktop",
    }
    expect(evaluateConditionTree(leaf, B2B_CONTEXT, SYS_MAP)).toBe(true)
  })

  it("B2B group: facebook + cpc + desktop", () => {
    const tree: ConditionTree = {
      type: "group",
      operator: "all",
      conditions: [
        { type: "condition", field: "platform", operator: "equals", value: "facebook" },
        { type: "condition", field: "utm_medium", operator: "equals", value: "cpc" },
        { type: "condition", field: "device", operator: "equals", value: "desktop" },
      ],
    }
    expect(evaluateConditionTree(tree, B2B_CONTEXT, SYS_MAP)).toBe(true)
  })
})

describe("Business model fixtures – Real estate (city + UTM campaign)", () => {
  const REAL_ESTATE_CONTEXT = buildLeadContextFromValues({
    city_canonical: "maracaibo",
    utm_campaign: "bienes_raices_q1",
    utm_source: "facebook",
    negocio_normalized: "si",
  })

  it("city in real-estate target list", () => {
    const leaf: ConditionLeaf = {
      type: "condition",
      field: "city_canonical",
      operator: "in_list",
      value: ["maracaibo", "valencia", "caracas"],
    }
    expect(evaluateConditionTree(leaf, REAL_ESTATE_CONTEXT, SYS_MAP)).toBe(true)
  })

  it("UTM campaign contains 'bienes_raices'", () => {
    const leaf: ConditionLeaf = {
      type: "condition",
      field: "utm_campaign",
      operator: "contains",
      value: "bienes_raices",
    }
    expect(evaluateConditionTree(leaf, REAL_ESTATE_CONTEXT, SYS_MAP)).toBe(true)
  })

  it("combined real estate qualifier group", () => {
    const tree: ConditionTree = {
      type: "group",
      operator: "all",
      conditions: [
        {
          type: "condition",
          field: "city_canonical",
          operator: "in_list",
          value: ["maracaibo", "valencia", "caracas"],
        },
        { type: "condition", field: "negocio_normalized", operator: "equals", value: "si" },
        { type: "condition", field: "utm_source", operator: "equals", value: "facebook" },
      ],
    }
    expect(evaluateConditionTree(tree, REAL_ESTATE_CONTEXT, SYS_MAP)).toBe(true)
  })
})

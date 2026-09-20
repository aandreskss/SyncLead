// ─── Meta Ads Insights — KPI calculations ─────────────────────────────────────

import { describe, it, expect } from "vitest"
import {
  calculateCPL,
  calculateCPA,
  calculateROAS,
  assertSingleCurrency,
  parseMetaSpend,
  extractLeadActions,
} from "@/domains/meta-insights/kpi"

describe("calculateCPL", () => {
  it("returns spend/leads when both are positive", () => {
    expect(calculateCPL(100, 10)).toBe(10)
  })

  it("returns null when spend is 0", () => {
    expect(calculateCPL(0, 10)).toBeNull()
  })

  it("returns null when leads is 0", () => {
    expect(calculateCPL(100, 0)).toBeNull()
  })

  it("returns null when spend is negative", () => {
    expect(calculateCPL(-1, 10)).toBeNull()
  })

  it("handles decimal spend correctly", () => {
    expect(calculateCPL(150.50, 5)).toBeCloseTo(30.1)
  })
})

describe("calculateCPA", () => {
  it("returns spend/conversions when both are positive", () => {
    expect(calculateCPA(200, 4)).toBe(50)
  })

  it("returns null when conversions is 0", () => {
    expect(calculateCPA(100, 0)).toBeNull()
  })

  it("returns null when spend is 0", () => {
    expect(calculateCPA(0, 5)).toBeNull()
  })
})

describe("calculateROAS", () => {
  it("returns revenue/spend", () => {
    expect(calculateROAS(500, 100)).toBe(5)
  })

  it("returns null when spend is 0", () => {
    expect(calculateROAS(500, 0)).toBeNull()
  })

  it("handles ROAS < 1 (loss)", () => {
    expect(calculateROAS(50, 100)).toBe(0.5)
  })
})

describe("assertSingleCurrency", () => {
  it("returns the single currency when all match", () => {
    expect(assertSingleCurrency(["USD", "USD", "USD"])).toBe("USD")
  })

  it("returns null when currencies are mixed", () => {
    expect(assertSingleCurrency(["USD", "EUR"])).toBeNull()
  })

  it("returns null when all are null", () => {
    expect(assertSingleCurrency([null, null])).toBeNull()
  })

  it("ignores null values when there is a single non-null currency", () => {
    expect(assertSingleCurrency([null, "USD", null])).toBe("USD")
  })

  it("returns null for empty array", () => {
    expect(assertSingleCurrency([])).toBeNull()
  })
})

describe("parseMetaSpend", () => {
  it("parses a valid spend string", () => {
    expect(parseMetaSpend("10.50")).toBe(10.5)
  })

  it("returns 0 for null", () => {
    expect(parseMetaSpend(null)).toBe(0)
  })

  it("returns 0 for undefined", () => {
    expect(parseMetaSpend(undefined)).toBe(0)
  })

  it("returns 0 for empty string", () => {
    expect(parseMetaSpend("")).toBe(0)
  })

  it("returns 0 for non-numeric string", () => {
    expect(parseMetaSpend("abc")).toBe(0)
  })

  it("rounds to 2 decimal places", () => {
    expect(parseMetaSpend("10.999")).toBe(11)
  })
})

describe("extractLeadActions", () => {
  it("extracts lead action count", () => {
    const actions = [
      { action_type: "lead", value: "5" },
      { action_type: "link_click", value: "100" },
    ]
    expect(extractLeadActions(actions)).toBe(5)
  })

  it("includes onsite_conversion.lead_grouped", () => {
    const actions = [
      { action_type: "onsite_conversion.lead_grouped", value: "3" },
    ]
    expect(extractLeadActions(actions)).toBe(3)
  })

  it("sums multiple lead types", () => {
    const actions = [
      { action_type: "lead", value: "2" },
      { action_type: "onsite_conversion.lead_grouped", value: "3" },
    ]
    expect(extractLeadActions(actions)).toBe(5)
  })

  it("returns 0 for undefined actions", () => {
    expect(extractLeadActions(undefined)).toBe(0)
  })

  it("returns 0 for empty array", () => {
    expect(extractLeadActions([])).toBe(0)
  })

  it("ignores non-lead action types", () => {
    const actions = [
      { action_type: "purchase", value: "10" },
      { action_type: "page_engagement", value: "50" },
    ]
    expect(extractLeadActions(actions)).toBe(0)
  })
})

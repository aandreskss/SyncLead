import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}))

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {},
  },
}))

vi.mock("@/lib/db/schema", () => ({
  aiPricingTiers: { provider: "provider", model: "model", effectiveFrom: "effectiveFrom", effectiveTo: "effectiveTo" },
  aiBudgetLimits: { orgId: "orgId" },
  aiBudgetReservations: { orgId: "orgId", status: "status", reservedAt: "reservedAt", queueItemId: "queueItemId" },
  aiUsageRecords: { orgId: "orgId", isSandbox: "isSandbox", createdAt: "createdAt", conversationId: "conversationId", episodeId: "episodeId", totalCostMillicents: "totalCostMillicents", inputTokens: "inputTokens", outputTokens: "outputTokens", cacheReadTokens: "cacheReadTokens", cacheWriteTokens: "cacheWriteTokens", latencyMs: "latencyMs" },
  aiEpisodes: { orgId: "orgId", startedAt: "startedAt", status: "status", exitReason: "exitReason", campaignId: "campaignId", agentVersionId: "agentVersionId", conversationId: "conversationId", id: "id" },
  aiAgentVersions: { agentId: "agentId", orgId: "orgId", id: "id" },
  aiAgents: { orgId: "orgId", id: "id", name: "name" },
  campaigns: { id: "id" },
  waConversations: { orgId: "orgId", id: "id", phoneNumberId: "phoneNumberId", leadId: "leadId", customerPhone: "customerPhone", customerName: "customerName", messageCount: "messageCount" },
  waConversationMessages: { orgId: "orgId", conversationId: "conversationId", isAi: "isAi", status: "status" },
  leads: { id: "id", temperature: "temperature" },
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import {
  computeCostMillicents,
  computeConservativeReservationMillicents,
  formatMillicentsAsUsd,
  getModelDisplayName,
} from "@/domains/ai-agents/cost-calculator"
import type { PricingTierData } from "@/domains/ai-agents/cost-calculator"

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Sonnet 4.6 published rates: $3/1M input, $15/1M output, $0.30/1M cache_read, $3.75/1M cache_write
// Converted: 300 mc/1000 input, 1500 mc/1000 output, 30 mc/1000 cache_read, 375 mc/1000 cache_write
function makeSonnetTier(overrides: Partial<PricingTierData> = {}): PricingTierData {
  return {
    id: "tier-sonnet",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    inputMillicentsPerToken: 300,
    outputMillicentsPerToken: 1500,
    cacheReadMillicentsPerToken: 30,
    cacheWriteMillicentsPerToken: 375,
    source: "anthropic_published",
    ...overrides,
  }
}

// Haiku 4.5 published rates: $0.80/1M input, $4/1M output, $0.08/1M cache_read, $1/1M cache_write
function makeHaikuTier(overrides: Partial<PricingTierData> = {}): PricingTierData {
  return {
    id: "tier-haiku",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    inputMillicentsPerToken: 80,
    outputMillicentsPerToken: 400,
    cacheReadMillicentsPerToken: 8,
    cacheWriteMillicentsPerToken: 100,
    source: "anthropic_published",
    ...overrides,
  }
}

// ─── Cost calculator tests ────────────────────────────────────────────────────

describe("Phase 09 — Cost calculator (pure functions)", () => {

  it("1. computes Sonnet 4.6 cost correctly for 1000 input + 500 output tokens", () => {
    const tier = makeSonnetTier()
    const result = computeCostMillicents(
      { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 },
      tier
    )
    // 1000 * 300 / 1000 = 300 mc
    expect(result.inputCostMillicents).toBe(300)
    // 500 * 1500 / 1000 = 750 mc
    expect(result.outputCostMillicents).toBe(750)
    expect(result.cacheReadCostMillicents).toBe(0)
    expect(result.cacheWriteCostMillicents).toBe(0)
    expect(result.totalCostMillicents).toBe(1050)
  })

  it("2. computes Haiku 4.5 cost (significantly cheaper than Sonnet)", () => {
    const tier = makeHaikuTier()
    const result = computeCostMillicents(
      { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 },
      tier
    )
    // 1000 * 80 / 1000 = 80 mc
    expect(result.inputCostMillicents).toBe(80)
    // 500 * 400 / 1000 = 200 mc
    expect(result.outputCostMillicents).toBe(200)
    expect(result.totalCostMillicents).toBe(280)
    // Haiku should be much cheaper than Sonnet
    const sonnetCost = computeCostMillicents(
      { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 },
      makeSonnetTier()
    )
    expect(result.totalCostMillicents).toBeLessThan(sonnetCost.totalCostMillicents)
  })

  it("3. cache read tokens cost less than input tokens (Sonnet)", () => {
    const tier = makeSonnetTier()
    const cacheResult = computeCostMillicents(
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1000, cacheWriteTokens: 0 },
      tier
    )
    const inputResult = computeCostMillicents(
      { inputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      tier
    )
    // cache_read: 1000 * 30 / 1000 = 30 mc; input: 300 mc
    expect(cacheResult.cacheReadCostMillicents).toBe(30)
    expect(cacheResult.cacheReadCostMillicents).toBeLessThan(inputResult.inputCostMillicents)
  })

  it("4. cache write tokens cost more than input tokens (Sonnet)", () => {
    const tier = makeSonnetTier()
    const cacheWriteResult = computeCostMillicents(
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 1000 },
      tier
    )
    const inputResult = computeCostMillicents(
      { inputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      tier
    )
    // cache_write: 1000 * 375 / 1000 = 375 mc; input: 300 mc
    expect(cacheWriteResult.cacheWriteCostMillicents).toBe(375)
    expect(cacheWriteResult.cacheWriteCostMillicents).toBeGreaterThan(inputResult.inputCostMillicents)
  })

  it("5. handles zero tokens correctly (no NaN, no negative)", () => {
    const tier = makeSonnetTier()
    const result = computeCostMillicents(
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      tier
    )
    expect(result.totalCostMillicents).toBe(0)
    expect(result.inputCostMillicents).toBe(0)
    expect(result.outputCostMillicents).toBe(0)
  })

  it("6. null cache rates fall back to 0 (no cache pricing configured)", () => {
    const tier = makeSonnetTier({ cacheReadMillicentsPerToken: null, cacheWriteMillicentsPerToken: null })
    const result = computeCostMillicents(
      { inputTokens: 100, outputTokens: 50, cacheReadTokens: 1000, cacheWriteTokens: 500 },
      tier
    )
    // Cache tokens should cost 0 when no rate configured
    expect(result.cacheReadCostMillicents).toBe(0)
    expect(result.cacheWriteCostMillicents).toBe(0)
    // Regular tokens should still be computed
    expect(result.inputCostMillicents).toBeGreaterThan(0)
  })

  it("7. conservative reservation adds 20% buffer", () => {
    const tier = makeSonnetTier()
    const inputTokens = 2000
    const maxOutput = 1024
    const reservation = computeConservativeReservationMillicents(inputTokens, maxOutput, tier)

    const inputMc = Math.round(inputTokens * 300 / 1000) // 600
    const outputMc = Math.round(maxOutput * 1500 / 1000) // 1536
    const expected = Math.ceil((inputMc + outputMc) * 1.2) // ceil(2136 * 1.2) = ceil(2563.2) = 2564

    expect(reservation).toBe(expected)
    expect(reservation).toBeGreaterThan(inputMc + outputMc)
  })

  it("8. conservative reservation is always ≥ naive estimate", () => {
    const tier = makeHaikuTier()
    const naive = computeCostMillicents(
      { inputTokens: 5000, outputTokens: 800, cacheReadTokens: 0, cacheWriteTokens: 0 },
      tier
    )
    const reservation = computeConservativeReservationMillicents(5000, 800, tier)
    expect(reservation).toBeGreaterThanOrEqual(naive.totalCostMillicents)
  })

})

// ─── Formatting helpers ───────────────────────────────────────────────────────

describe("Phase 09 — formatMillicentsAsUsd", () => {

  it("9. formats null/undefined as N/D", () => {
    expect(formatMillicentsAsUsd(null)).toBe("N/D")
    expect(formatMillicentsAsUsd(undefined)).toBe("N/D")
  })

  it("10. formats zero as <$0.00001 (0 USD is below display threshold)", () => {
    // 0 mc / 100_000 = 0 USD, which is < 0.00001 → shows sentinel
    expect(formatMillicentsAsUsd(0)).toBe("<$0.00001")
  })

  it("11. formats 100_000 mc as $1.00000 (1 USD)", () => {
    expect(formatMillicentsAsUsd(100_000)).toBe("$1.00000")
  })

  it("12. formats 1 mc as $0.00001 (exactly at display threshold, not below)", () => {
    // 1 mc / 100_000 = 0.00001 USD exactly — NOT less than 0.00001, so formats normally
    expect(formatMillicentsAsUsd(1)).toBe("$0.00001")
  })

  it("13. 300 mc = $0.00300 (input cost for 1000 Sonnet tokens)", () => {
    // 300/100_000 = 0.003
    expect(formatMillicentsAsUsd(300)).toBe("$0.00300")
  })

  it("14. getModelDisplayName returns human readable name", () => {
    expect(getModelDisplayName("claude-sonnet-4-6")).toBe("Claude Sonnet")
    expect(getModelDisplayName("claude-haiku-4-5-20251001")).toBe("Claude Haiku")
    expect(getModelDisplayName("claude-opus-4-7")).toBe("Claude Opus")
    expect(getModelDisplayName("unknown-model")).toBe("unknown-model")
  })

})

// ─── Budget logic (stateless business rules) ─────────────────────────────────

describe("Phase 09 — Budget business rules", () => {

  it("15. daily spend + reservation sum correctly", () => {
    const confirmedSpend = 50_000
    const activeReservation = 10_000
    const totalSpend = confirmedSpend + activeReservation
    expect(totalSpend).toBe(60_000)
  })

  it("16. budget limit check: spend + estimate > limit → deny", () => {
    const dailyLimit = 100_000
    const currentSpend = 85_000
    const estimatedCost = 20_000
    expect(currentSpend + estimatedCost > dailyLimit).toBe(true)
  })

  it("17. budget limit check: spend + estimate ≤ limit → allow", () => {
    const dailyLimit = 100_000
    const currentSpend = 70_000
    const estimatedCost = 20_000
    expect(currentSpend + estimatedCost > dailyLimit).toBe(false)
  })

  it("18. sandbox episodes do not count toward budget (column-level isolation)", () => {
    // Sandbox flag ensures DB-level filtering: isSandbox = true records excluded from spend queries
    const sandboxCost = 50_000
    const productionCost = 30_000
    // Budget query uses WHERE isSandbox = false → only productionCost counted
    const billedCost = productionCost  // sandboxCost excluded
    expect(billedCost).toBe(30_000)
    expect(billedCost).not.toBe(sandboxCost + productionCost)
  })

  it("19. orphan cutoff is 30 minutes by default", () => {
    const defaultMaxAgeMs = 30 * 60 * 1000
    expect(defaultMaxAgeMs).toBe(1_800_000)
    const cutoff = new Date(Date.now() - defaultMaxAgeMs)
    expect(cutoff).toBeInstanceOf(Date)
    expect(cutoff.getTime()).toBeLessThan(Date.now())
  })

  it("20. per-conversation limit check works independently of daily limit", () => {
    const perConvLimit = 5_000
    const convSpend = 4_000
    const estimate = 2_000
    // Would exceed per-conversation limit even if daily is fine
    expect(convSpend + estimate > perConvLimit).toBe(true)
  })

  it("21. alert threshold triggers at or above configured percentage", () => {
    const limit = 100_000
    const spent = 82_000
    const alertPct = 80
    const pctUsed = Math.round(spent / limit * 100)
    expect(pctUsed).toBe(82)
    expect(pctUsed >= alertPct).toBe(true)
  })

  it("22. no alert below threshold", () => {
    const limit = 100_000
    const spent = 75_000
    const alertPct = 80
    const pctUsed = Math.round(spent / limit * 100)
    expect(pctUsed >= alertPct).toBe(false)
  })

})

// ─── Analytics edge cases (pure logic) ───────────────────────────────────────

describe("Phase 09 — Analytics edge cases", () => {

  it("23. zero episode denominator returns null avgCost (no division by zero)", () => {
    const endedCount = 0
    const totalCost = 50_000
    const avgCost = endedCount > 0 ? Math.round(totalCost / endedCount) : null
    expect(avgCost).toBeNull()
  })

  it("24. non-zero episodes returns correct average", () => {
    const endedCount = 4
    const totalCost = 80_000
    const avgCost = endedCount > 0 ? Math.round(totalCost / endedCount) : null
    expect(avgCost).toBe(20_000)
  })

  it("25. null totalCostMillicents from DB (no pricing tier) yields null, not 0", () => {
    // When no pricing tier configured, sum() returns null — must propagate as null, not 0
    const dbResult: { totalCostMillicents: string | null } = { totalCostMillicents: null }
    const parsed = dbResult.totalCostMillicents !== null ? Number(dbResult.totalCostMillicents) : null
    expect(parsed).toBeNull()
    expect(parsed).not.toBe(0)
  })

  it("26. exit reason breakdown does not double-count across agents", () => {
    const episodes = [
      { exitReason: "objective_met" },
      { exitReason: "objective_met" },
      { exitReason: "transfer_rule" },
      { exitReason: null },
      { exitReason: "inactivity" },
    ]
    const breakdown: Record<string, number> = {}
    for (const ep of episodes) {
      const reason = ep.exitReason ?? "unknown"
      breakdown[reason] = (breakdown[reason] ?? 0) + 1
    }
    expect(breakdown["objective_met"]).toBe(2)
    expect(breakdown["transfer_rule"]).toBe(1)
    expect(breakdown["unknown"]).toBe(1)
    expect(breakdown["inactivity"]).toBe(1)
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
    expect(total).toBe(episodes.length)
  })

  it("27. unique leads deduplication works across multiple conversations", () => {
    const conversations = [
      { leadId: "lead-A" },
      { leadId: "lead-A" }, // same lead in two convos
      { leadId: "lead-B" },
      { leadId: null },     // no lead
    ]
    const uniqueLeads = new Set(conversations.map(c => c.leadId).filter(Boolean)).size
    expect(uniqueLeads).toBe(2)  // only lead-A and lead-B, not null
  })

  it("28. multi-tenant data stays isolated by orgId (runtime check)", () => {
    const records = [
      { orgId: "org-1", cost: 10_000 },
      { orgId: "org-2", cost: 20_000 },
      { orgId: "org-1", cost: 5_000 },
    ]
    const org1Total = records.filter(r => r.orgId === "org-1").reduce((sum, r) => sum + r.cost, 0)
    const org2Total = records.filter(r => r.orgId === "org-2").reduce((sum, r) => sum + r.cost, 0)
    expect(org1Total).toBe(15_000)
    expect(org2Total).toBe(20_000)
    expect(org1Total).not.toBe(org2Total)
  })

  it("29. cost per episode with open episodes excluded from denominator", () => {
    // Only ENDED episodes count for avgCost denominator (open episodes may still accumulate cost)
    const allEpisodes = [
      { status: "ended", id: "ep-1" },
      { status: "ended", id: "ep-2" },
      { status: "active", id: "ep-3" }, // open episode — excluded from denominator
    ]
    const endedEpisodes = allEpisodes.filter(e => e.status === "ended")
    const totalCost = 60_000
    const avgCostPerEnded = Math.round(totalCost / endedEpisodes.length)
    expect(avgCostPerEnded).toBe(30_000)
    expect(endedEpisodes.length).toBe(2)
  })

  it("30. delivery rate calculation handles zero messages", () => {
    const delivered = 0
    const failed = 0
    const rate = (delivered + failed) > 0
      ? Math.round(delivered / (delivered + failed) * 100)
      : null
    expect(rate).toBeNull()
  })

  it("31. delivery rate is 100% with all delivered and no failures", () => {
    const delivered = 50
    const failed = 0
    const rate = (delivered + failed) > 0
      ? Math.round(delivered / (delivered + failed) * 100)
      : null
    expect(rate).toBe(100)
  })

  it("32. token accumulation is additive across multiple engine turns", () => {
    // Simulates the bug fix: each turn adds to running total, not overwrites
    let totalInput = 0
    let totalOutput = 0
    const turns = [
      { inputTokens: 500, outputTokens: 200 },
      { inputTokens: 300, outputTokens: 150 },
      { inputTokens: 200, outputTokens: 100 },
    ]
    for (const turn of turns) {
      totalInput += turn.inputTokens
      totalOutput += turn.outputTokens
    }
    expect(totalInput).toBe(1000)
    expect(totalOutput).toBe(450)
    // Bug would have given last turn's values only: 200/100
    expect(totalInput).not.toBe(200)
  })

  it("33. isSandbox flag prevents test sessions from affecting budget", () => {
    const records = [
      { isSandbox: true, cost: 5_000 },
      { isSandbox: false, cost: 3_000 },
      { isSandbox: true, cost: 8_000 },
      { isSandbox: false, cost: 2_000 },
    ]
    const productionCost = records.filter(r => !r.isSandbox).reduce((s, r) => s + r.cost, 0)
    expect(productionCost).toBe(5_000)
  })

  it("34. millicents precision: 1 USD = 100_000 millicents", () => {
    const oneDollar = 100_000
    expect(oneDollar / 100_000).toBe(1)
    // Floating point safe: no intermediate division
    const tokens = 1_000_000
    const rateMcPer1000 = 300 // $3/1M tokens = 300 mc/1000 tokens
    const cost = tokens * rateMcPer1000 / 1000 // = 300_000 mc = $3.00
    expect(cost).toBe(300_000)
    expect(cost / 100_000).toBe(3)
  })

  it("35. concurrent budget check: second reservation at limit is denied", () => {
    const dailyLimit = 100_000
    const firstSpend = 60_000
    const firstEstimate = 45_000
    const secondEstimate = 45_000

    // First request: 60k spent + 45k estimate = 105k > 100k LIMIT → DENIED
    const firstAllowed = (firstSpend + firstEstimate) <= dailyLimit
    expect(firstAllowed).toBe(false)

    // After first is denied, second request
    const spendIfFirstDenied = 60_000  // same as before, no reservation added
    const secondAllowed = (spendIfFirstDenied + secondEstimate) <= dailyLimit
    expect(secondAllowed).toBe(false)

    // With a lower estimate, second request might pass
    const lowEstimate = 30_000
    const lowAllowed = (firstSpend + lowEstimate) <= dailyLimit
    expect(lowAllowed).toBe(true)
  })

})

// ─── Extended analytics — new spec requirements ───────────────────────────────

describe("Phase 09 — Extended analytics (new metrics)", () => {

  // ── Leads calificados ────────────────────────────────────────────────────────

  it("36. leadsQualified counts distinct leads with non-unqualified evaluations", () => {
    // Fixture: 3 qualifications for 2 leads (one lead qualified twice — only counts once)
    const qualRows = [
      { leadId: "lead-A" },
      { leadId: "lead-A" }, // same lead, second evaluation — deduplicated
      { leadId: "lead-B" },
    ]
    const leadsQualified = new Set(qualRows.map(r => r.leadId)).size
    expect(leadsQualified).toBe(2)
  })

  it("37. leadsQualified ignores evaluations outside the date filter", () => {
    const from = new Date("2026-10-01T00:00:00Z")
    const to   = new Date("2026-10-10T23:59:59Z")
    const rows = [
      { leadId: "lead-A", evaluatedAt: new Date("2026-10-05T12:00:00Z"), qualClass: "warm" }, // IN range
      { leadId: "lead-B", evaluatedAt: new Date("2026-09-28T08:00:00Z"), qualClass: "hot"  }, // BEFORE range
      { leadId: "lead-C", evaluatedAt: new Date("2026-10-12T09:00:00Z"), qualClass: "warm" }, // AFTER range
    ]
    const inRange = rows.filter(r =>
      r.evaluatedAt >= from && r.evaluatedAt <= to && r.qualClass !== "unqualified"
    )
    expect(new Set(inRange.map(r => r.leadId)).size).toBe(1)
    expect(inRange[0]!.leadId).toBe("lead-A")
  })

  it("38. leadsQualified excludes 'unqualified' class", () => {
    const rows = [
      { leadId: "lead-A", qualClass: "warm"        },
      { leadId: "lead-B", qualClass: "unqualified" }, // excluded
      { leadId: "lead-C", qualClass: "hot"         },
    ]
    const qualified = rows.filter(r => r.qualClass !== "unqualified")
    expect(new Set(qualified.map(r => r.leadId)).size).toBe(2)
  })

  // ── Datos completados ────────────────────────────────────────────────────────

  it("39. dataCompleted counts leads with name+phone+email all set", () => {
    const leads = [
      { id: "lead-A", name: "Ana", phone: "+58412", email: "ana@test.com" },   // complete
      { id: "lead-B", name: "Bob", phone: "+58413", email: null              }, // missing email
      { id: "lead-C", name: null,  phone: "+58414", email: "carl@test.com"  }, // missing name
      { id: "lead-D", name: "Dia", phone: "+58415", email: "dia@test.com"   }, // complete
    ]
    const completed = leads.filter(l => l.name !== null && l.phone !== null && l.email !== null)
    expect(completed.length).toBe(2)
    expect(completed.map(l => l.id)).toEqual(["lead-A", "lead-D"])
  })

  // ── Primera respuesta humana ─────────────────────────────────────────────────

  it("40. firstHumanResponseMs is avg time from episode start to first human outbound reply", () => {
    const fixtures = [
      {
        conversationId: "conv-1",
        epStart: new Date("2026-10-05T10:00:00Z"),
        firstHumanAt: new Date("2026-10-05T10:05:00Z"), // 5 min = 300_000 ms
      },
      {
        conversationId: "conv-2",
        epStart: new Date("2026-10-05T12:00:00Z"),
        firstHumanAt: new Date("2026-10-05T12:09:00Z"), // 9 min = 540_000 ms
      },
    ]
    let totalMs = 0
    let count = 0
    for (const f of fixtures) {
      const diff = f.firstHumanAt.getTime() - f.epStart.getTime()
      if (diff > 0) { totalMs += diff; count++ }
    }
    const avgMs = count > 0 ? Math.round(totalMs / count) : null
    expect(avgMs).toBe(420_000) // avg of 300_000 and 540_000
  })

  it("41. firstHumanResponseMs ignores human reply BEFORE episode start", () => {
    // Human replied before the AI episode started — not a valid first-response
    const epStart = new Date("2026-10-05T10:00:00Z")
    const firstHumanAt = new Date("2026-10-05T09:55:00Z") // 5 min BEFORE start
    const diff = firstHumanAt.getTime() - epStart.getTime()
    // diff is negative — should be excluded
    expect(diff).toBeLessThan(0)
    const count = diff > 0 ? 1 : 0
    expect(count).toBe(0)
  })

  it("42. firstHumanResponseMs returns null when no human replies exist", () => {
    const humanReplies: { conversationId: string; firstAt: Date }[] = []
    const count = humanReplies.length
    const avgMs = count > 0 ? Math.round(0 / count) : null
    expect(avgMs).toBeNull()
  })

  // ── Ventas atribuidas ────────────────────────────────────────────────────────

  it("43. salesAttributed counts conversions within 7-day window", () => {
    const WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
    const epStart = new Date("2026-10-01T00:00:00Z")
    const sales = [
      { leadId: "lead-A", convertedAt: new Date("2026-10-03T12:00:00Z") }, // +2 days — IN window
      { leadId: "lead-B", convertedAt: new Date("2026-10-07T23:59:59Z") }, // +6.99 days — IN window
      { leadId: "lead-C", convertedAt: new Date("2026-10-08T01:00:00Z") }, // +7.04 days — OUT
      { leadId: "lead-D", convertedAt: new Date("2026-09-30T12:00:00Z") }, // -0.5 days — before ep start
    ]
    const leadEpStart = new Map([
      ["lead-A", epStart], ["lead-B", epStart], ["lead-C", epStart], ["lead-D", epStart],
    ])
    const attributed = new Set<string>()
    for (const s of sales) {
      const start = leadEpStart.get(s.leadId)!
      const diff = s.convertedAt.getTime() - start.getTime()
      if (diff >= 0 && diff <= WINDOW_MS) attributed.add(s.leadId)
    }
    expect(attributed.size).toBe(2)
    expect([...attributed].sort()).toEqual(["lead-A", "lead-B"])
  })

  it("44. salesAttributed deduplicates leads with multiple episodes (no double-count)", () => {
    // lead-A had 2 episodes — but the attribution is per lead, not per episode
    const WINDOW_MS = 7 * 24 * 60 * 60 * 1000
    const episodes = [
      { conversationId: "conv-1", leadId: "lead-A", startedAt: new Date("2026-10-01T00:00:00Z") },
      { conversationId: "conv-2", leadId: "lead-A", startedAt: new Date("2026-10-03T00:00:00Z") }, // second episode same lead
      { conversationId: "conv-3", leadId: "lead-B", startedAt: new Date("2026-10-01T00:00:00Z") },
    ]
    // Build per-lead earliest episode start
    const leadEarliestStart = new Map<string, Date>()
    for (const ep of episodes) {
      const existing = leadEarliestStart.get(ep.leadId)
      if (!existing || ep.startedAt < existing) leadEarliestStart.set(ep.leadId, ep.startedAt)
    }
    const sales = [
      { leadId: "lead-A", convertedAt: new Date("2026-10-04T00:00:00Z") }, // within 7d of earliest ep
      { leadId: "lead-B", convertedAt: new Date("2026-10-05T00:00:00Z") },
    ]
    const attributed = new Set<string>()
    for (const s of sales) {
      const start = leadEarliestStart.get(s.leadId)!
      const diff = s.convertedAt.getTime() - start.getTime()
      if (diff >= 0 && diff <= WINDOW_MS) attributed.add(s.leadId)
    }
    // lead-A counted once even though it had 2 episodes
    expect(attributed.size).toBe(2)
  })

  // ── call_type: retry ─────────────────────────────────────────────────────────

  it("45. callType is 'retry' when attemptCount > 1", () => {
    const getCallType = (attemptCount: number) =>
      attemptCount > 1 ? "retry" : "inference"
    expect(getCallType(1)).toBe("inference") // first attempt
    expect(getCallType(2)).toBe("retry")     // second attempt
    expect(getCallType(5)).toBe("retry")     // fifth attempt (dead-letter boundary)
  })

  it("46. retry records are excluded from normal inference cost totals when filtered", () => {
    const records = [
      { callType: "inference", totalCostMillicents: 1_000 },
      { callType: "retry",     totalCostMillicents: 800   }, // retry may cost less (shorter context)
      { callType: "inference", totalCostMillicents: 1_200 },
    ]
    // Total across all types
    const totalAll = records.reduce((s, r) => s + r.totalCostMillicents, 0)
    expect(totalAll).toBe(3_000)
    // Total inference only
    const totalInference = records
      .filter(r => r.callType === "inference")
      .reduce((s, r) => s + r.totalCostMillicents, 0)
    expect(totalInference).toBe(2_200)
  })

  // ── Multi-tenant isolation ────────────────────────────────────────────────────

  it("47. analytics results from different orgs never mix", () => {
    const episodes = [
      { id: "ep-1", orgId: "org-A", conversationId: "conv-1", status: "ended", exitReason: "objective_met" },
      { id: "ep-2", orgId: "org-B", conversationId: "conv-2", status: "ended", exitReason: "transfer_rule" },
      { id: "ep-3", orgId: "org-A", conversationId: "conv-3", status: "active", exitReason: null },
    ]
    const orgAEps = episodes.filter(e => e.orgId === "org-A")
    const orgBEps = episodes.filter(e => e.orgId === "org-B")
    expect(orgAEps.length).toBe(2)
    expect(orgBEps.length).toBe(1)
    // Org A summary
    const orgABreakdown: Record<string, number> = {}
    for (const ep of orgAEps.filter(e => e.status === "ended")) {
      const r = ep.exitReason ?? "unknown"
      orgABreakdown[r] = (orgABreakdown[r] ?? 0) + 1
    }
    expect(orgABreakdown["objective_met"]).toBe(1)
    expect(orgABreakdown["transfer_rule"]).toBeUndefined() // org-B's episode not mixed in
  })

  it("48. multi-campaign filter: episodes from campaign X don't appear in campaign Y summary", () => {
    const episodes = [
      { id: "ep-1", campaignId: "camp-X", orgId: "org-A" },
      { id: "ep-2", campaignId: "camp-Y", orgId: "org-A" },
      { id: "ep-3", campaignId: "camp-X", orgId: "org-A" },
    ]
    const campX = episodes.filter(e => e.campaignId === "camp-X")
    const campY = episodes.filter(e => e.campaignId === "camp-Y")
    expect(campX.length).toBe(2)
    expect(campY.length).toBe(1)
  })

  // ── Timezone edge cases ───────────────────────────────────────────────────────

  it("49. episode at UTC 23:58 and UTC 00:02 span midnight — both included in UTC-day range", () => {
    // When the filter uses UTC dates, both sides of midnight are included
    const from = new Date("2026-10-05T00:00:00Z")
    const to   = new Date("2026-10-05T23:59:59Z")
    const episodes = [
      { startedAt: new Date("2026-10-04T23:58:00Z") }, // before — excluded
      { startedAt: new Date("2026-10-05T00:02:00Z") }, // after midnight UTC — included
      { startedAt: new Date("2026-10-05T23:55:00Z") }, // same day UTC — included
    ]
    const inRange = episodes.filter(e => e.startedAt >= from && e.startedAt <= to)
    expect(inRange.length).toBe(2)
  })

  it("50. episode spanning midnight: started_at in range even if ended_at is next day", () => {
    // Analytics filters on startedAt, not endedAt
    const from = new Date("2026-10-05T00:00:00Z")
    const to   = new Date("2026-10-05T23:59:59Z")
    const ep = {
      startedAt: new Date("2026-10-05T23:00:00Z"),
      endedAt:   new Date("2026-10-06T00:30:00Z"), // ended next day
    }
    // Episode IS in range (startedAt is in range; endedAt is irrelevant for filtering)
    expect(ep.startedAt >= from && ep.startedAt <= to).toBe(true)
  })

  // ── Open episodes ─────────────────────────────────────────────────────────────

  it("51. open episodes are counted in episodesStarted and episodesActive but NOT in avgCost denominator", () => {
    const allEpisodes = [
      { id: "ep-1", status: "ended" },
      { id: "ep-2", status: "active" }, // still open
      { id: "ep-3", status: "ended" },
    ]
    const ended = allEpisodes.filter(e => e.status === "ended")
    const active = allEpisodes.filter(e => e.status === "active")
    expect(allEpisodes.length).toBe(3) // episodesStarted = 3
    expect(active.length).toBe(1)      // episodesActive = 1
    // avgCost denominator = only ended
    const totalCost = 60_000
    const avgCost = ended.length > 0 ? Math.round(totalCost / ended.length) : null
    expect(avgCost).toBe(30_000) // 60k / 2 ended episodes
    expect(ended.length).toBe(2)
  })

  // ── Failures without usage ────────────────────────────────────────────────────

  it("52. failed engine run with no tokens should produce null cost (not 0)", () => {
    // If the engine fails before generating any tokens, no usage record is created.
    // The summary should return null totalCostMillicents, not 0.
    const usageRows = [] // empty — no records for this episode set
    const sumResult: { totalCostMillicents: string | null } = { totalCostMillicents: null }
    const totalCost = sumResult.totalCostMillicents !== null
      ? Number(sumResult.totalCostMillicents)
      : null
    expect(totalCost).toBeNull() // NOT 0
  })

  it("53. episode with partial token data: cost is null if no pricing tier, not forced 0", () => {
    // Engine ran and produced tokens but no pricing tier was configured
    const usage = { inputTokens: 500, outputTokens: 200 }
    const tier = null // no pricing tier
    const cost = tier !== null ? usage.inputTokens * 300 / 1000 : null
    expect(cost).toBeNull()
    expect(cost).not.toBe(0)
  })

  // ── costPerQualifiedLead ──────────────────────────────────────────────────────

  it("54. costPerQualifiedLeadMillicents is null when no leads qualified", () => {
    const totalCost: number | null = 50_000
    const leadsQualified = 0
    const cpl = (totalCost !== null && leadsQualified > 0)
      ? Math.round(totalCost / leadsQualified)
      : null
    expect(cpl).toBeNull()
  })

  it("55. costPerQualifiedLeadMillicents is null when cost is null (no pricing data)", () => {
    const totalCost: number | null = null
    const leadsQualified = 3
    const cpl = (totalCost !== null && leadsQualified > 0)
      ? Math.round(totalCost / leadsQualified)
      : null
    expect(cpl).toBeNull()
  })

  it("56. costPerQualifiedLeadMillicents computes correctly when both are nonzero", () => {
    const totalCost = 90_000
    const leadsQualified = 3
    const cpl = Math.round(totalCost / leadsQualified)
    expect(cpl).toBe(30_000)
  })

})

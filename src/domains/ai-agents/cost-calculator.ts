import "server-only"
import { db } from "@/lib/db"
import { aiPricingTiers } from "@/lib/db/schema"
import type { AiPricingTier } from "@/lib/db/schema"
import { eq, and, isNull, lte, gte, or } from "drizzle-orm"

// ─── Types ────────────────────────────────────────────────────────────────────

// Lightweight interface for callers that don't need full DB fields.
// Used internally for cost computation; exposed for callers that build their own tier data.
export interface PricingTierData {
  id: string
  provider: string
  model: string
  inputMillicentsPerToken: number
  outputMillicentsPerToken: number
  cacheReadMillicentsPerToken: number | null
  cacheWriteMillicentsPerToken: number | null
  source: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface CostBreakdown {
  inputCostMillicents: number
  outputCostMillicents: number
  cacheReadCostMillicents: number
  cacheWriteCostMillicents: number
  totalCostMillicents: number
}

// ─── Pricing tier lookup ──────────────────────────────────────────────────────

// Returns the active pricing tier for a provider+model at a given time (default: now).
// Returns null if no tier configured for this model.
export async function getActivePricingTier(
  provider: string,
  model: string,
  at?: Date
): Promise<AiPricingTier | null> {
  const asOf = at ?? new Date()
  const rows = await db
    .select()
    .from(aiPricingTiers)
    .where(
      and(
        eq(aiPricingTiers.provider, provider),
        eq(aiPricingTiers.model, model),
        lte(aiPricingTiers.effectiveFrom, asOf),
        or(isNull(aiPricingTiers.effectiveTo), gte(aiPricingTiers.effectiveTo, asOf))
      )
    )
    .orderBy(aiPricingTiers.effectiveFrom) // most recent first
    .limit(1)
  return rows[0] ?? null
}

// Best-effort tier lookup: tries exact model name, then prefix match (e.g. "claude-sonnet")
export async function resolveModelPricingTier(
  provider: string,
  model: string
): Promise<AiPricingTier | null> {
  const exact = await getActivePricingTier(provider, model)
  if (exact) return exact

  // Fuzzy match: try known model families
  const allRows = await db
    .select()
    .from(aiPricingTiers)
    .where(eq(aiPricingTiers.provider, provider))

  const now = new Date()
  const active = allRows.filter(r =>
    r.effectiveFrom <= now && (r.effectiveTo === null || r.effectiveTo >= now)
  )

  // Normalize model strings for matching (lowercase, ignore version suffixes after last "-")
  const modelLower = model.toLowerCase()
  const match = active.find(r => {
    const rModel = r.model.toLowerCase()
    return modelLower.includes("sonnet") && rModel.includes("sonnet")
      || modelLower.includes("haiku") && rModel.includes("haiku")
      || modelLower.includes("opus") && rModel.includes("opus")
  })
  return match ?? null
}

// ─── Cost computation (pure) ──────────────────────────────────────────────────

// Rate unit: millicents per 1000 tokens (stored in DB).
// Formula: cost_mc = tokens * rate / 1000
// Example: 10,000 tokens * 300 mc/1000tokens / 1000 = 3,000 mc = $0.03
export function computeCostMillicents(usage: TokenUsage, tier: AiPricingTier | PricingTierData): CostBreakdown {
  const inputCostMillicents = Math.round(usage.inputTokens * tier.inputMillicentsPerToken / 1000)
  const outputCostMillicents = Math.round(usage.outputTokens * tier.outputMillicentsPerToken / 1000)
  const cacheReadRate = tier.cacheReadMillicentsPerToken ?? 0
  const cacheWriteRate = tier.cacheWriteMillicentsPerToken ?? 0
  const cacheReadCostMillicents = Math.round(usage.cacheReadTokens * cacheReadRate / 1000)
  const cacheWriteCostMillicents = Math.round(usage.cacheWriteTokens * cacheWriteRate / 1000)
  return {
    inputCostMillicents,
    outputCostMillicents,
    cacheReadCostMillicents,
    cacheWriteCostMillicents,
    totalCostMillicents: inputCostMillicents + outputCostMillicents + cacheReadCostMillicents + cacheWriteCostMillicents,
  }
}

// Conservative reservation: worst-case output (maxOutputTokens) + estimated input, +20% buffer
// for tool call overhead. Overestimates intentionally to protect budget from surprises.
export function computeConservativeReservationMillicents(
  estimatedInputTokens: number,
  maxOutputTokens: number,
  tier: AiPricingTier | PricingTierData
): number {
  const inputMc = Math.round(estimatedInputTokens * tier.inputMillicentsPerToken / 1000)
  const outputMc = Math.round(maxOutputTokens * tier.outputMillicentsPerToken / 1000)
  return Math.ceil((inputMc + outputMc) * 1.2)
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function formatMillicentsAsUsd(mc: number | null | undefined): string {
  if (mc === null || mc === undefined) return "N/D"
  const usd = mc / 100_000
  if (usd < 0.00001) return "<$0.00001"
  return `$${usd.toFixed(5)}`
}

export function getModelDisplayName(model: string): string {
  const lower = model.toLowerCase()
  if (lower.includes("sonnet")) return "Claude Sonnet"
  if (lower.includes("haiku")) return "Claude Haiku"
  if (lower.includes("opus")) return "Claude Opus"
  return model
}

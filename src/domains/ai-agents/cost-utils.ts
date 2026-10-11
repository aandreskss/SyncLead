// Pure formatting helpers — no server-only, safe to import in client components.
// Heavy cost computation (DB queries) lives in cost-calculator.ts (server-only).

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

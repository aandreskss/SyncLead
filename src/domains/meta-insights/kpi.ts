// Pure KPI calculation functions — no I/O, easily testable.

export interface SpendData {
  totalSpend: number
  currency: string | null
}

/**
 * Cost Per Lead — null when spend is zero or lead count is zero.
 * Currency safety: returns null if currencies are mixed.
 */
export function calculateCPL(spend: number, leadCount: number): number | null {
  if (spend <= 0 || leadCount <= 0) return null
  return spend / leadCount
}

/**
 * Cost Per Acquisition — null when spend or conversions are zero.
 */
export function calculateCPA(spend: number, conversionsCount: number): number | null {
  if (spend <= 0 || conversionsCount <= 0) return null
  return spend / conversionsCount
}

/**
 * Return on Ad Spend — null when spend is zero.
 * revenue should be in the same currency as spend.
 */
export function calculateROAS(revenue: number, spend: number): number | null {
  if (spend <= 0) return null
  return revenue / spend
}

/**
 * Check that all rows use the same currency.
 * Returns the shared currency string, or null if mixed.
 */
export function assertSingleCurrency(currencies: (string | null | undefined)[]): string | null {
  const unique = new Set(currencies.filter((c): c is string => !!c))
  if (unique.size === 0) return null
  if (unique.size === 1) return [...unique][0]!
  return null // mixed currencies — KPIs would be meaningless
}

/**
 * Parse a Meta spend string to a number with 2 decimal precision.
 * Meta returns spend as a string like "10.50".
 */
export function parseMetaSpend(raw: string | undefined | null): number {
  if (!raw) return 0
  const n = parseFloat(raw)
  return isNaN(n) ? 0 : Math.round(n * 100) / 100
}

/**
 * Extract lead count from Meta "actions" array.
 * Meta reports lead conversions under action_type = "lead" or "onsite_conversion.lead_grouped".
 */
export function extractLeadActions(actions: Array<{ action_type: string; value: string }> | undefined): number {
  if (!actions) return 0
  let total = 0
  for (const a of actions) {
    if (a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped") {
      total += parseInt(a.value ?? "0", 10)
    }
  }
  return total
}

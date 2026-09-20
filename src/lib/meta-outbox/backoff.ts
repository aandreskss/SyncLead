// ─── Exponential backoff with jitter ─────────────────────────────────────────

export interface BackoffOptions {
  /** Base delay in ms for attempt 1 (default 60_000 = 1 min) */
  baseMs?: number
  /** Maximum delay in ms (default 3_600_000 = 1 hour) */
  maxMs?: number
  /** Jitter fraction 0–1 (default 0.2 = ±20%) */
  jitter?: number
}

/**
 * Returns next retry delay in ms for the given attempt number (1-based).
 * Formula: clamp(base * 2^(attempt-1) * jitterFactor, 0, max)
 */
export function computeBackoff(attempt: number, opts: BackoffOptions = {}): number {
  const base = opts.baseMs ?? 60_000
  const max = opts.maxMs ?? 3_600_000
  const jitter = opts.jitter ?? 0.2

  const expo = base * Math.pow(2, attempt - 1)
  const jitterFactor = 1 + (Math.random() * 2 - 1) * jitter
  return Math.min(Math.round(expo * jitterFactor), max)
}

/** Returns the Date at which the next retry should occur. */
export function nextRetryAt(attempt: number, opts?: BackoffOptions): Date {
  return new Date(Date.now() + computeBackoff(attempt, opts))
}

export const DEFAULT_MAX_ATTEMPTS = parseInt(
  process.env.META_OUTBOX_MAX_ATTEMPTS ?? "8",
  10
)

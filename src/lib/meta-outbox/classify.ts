// ─── Meta CAPI error classification ──────────────────────────────────────────
// Retryable errors: transient failures that may resolve on their own.
// Permanent errors: invalid credentials, bad params — retrying won't help.

export type ErrorClass = "retryable" | "permanent"

/**
 * Classifies a Meta Graph API error code.
 * Returns "permanent" for errors that won't resolve by retrying,
 * "retryable" for transient errors (server errors, rate limits, network issues).
 */
export function classifyMetaErrorCode(code: number | null | undefined): ErrorClass {
  if (code == null) return "retryable" // unknown — assume transient

  // Auth/permission — token revoked, expired, or lacks access
  if (code === 190 || code === 102 || code === 200 || code === 273) return "permanent"

  // Invalid parameter — payload issue
  if (code === 100) return "permanent"

  // Rate limit — retryable
  if (code === 80001 || code === 80002 || code === 4) return "retryable"

  // Server-side errors
  if (code >= 500 && code < 600) return "retryable"

  // Unknown codes: treat as retryable (capped by MAX_ATTEMPTS)
  return "retryable"
}

export function classifyHttpStatus(httpStatus: number): ErrorClass {
  if (httpStatus === 429) return "retryable"
  if (httpStatus >= 500) return "retryable"
  if (httpStatus === 401 || httpStatus === 403) return "permanent"
  if (httpStatus >= 400) return "permanent"
  return "retryable"
}

export interface SendResult {
  success: boolean
  httpStatus: number
  eventsReceived: number | null
  fbtrace: string | null
  messages: string[]
  errorCode: number | null
  errorClass: ErrorClass
  /** Sanitized — no access tokens or raw PII */
  summary: string
}

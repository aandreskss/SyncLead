// ─── Log and error redaction utilities ───────────────────────────────────────
// All functions are pure — no I/O, no imports from external libs.
// Used to strip PII from error contexts, log messages, and API error bodies.

// Fields that must never appear in logs or error responses
const PII_KEYS = new Set([
  "password", "passwd", "secret", "token", "accessToken", "access_token",
  "apiKey", "api_key", "keyHash", "key_hash", "accessTokenEnc",
  "email", "phone", "name", "ip", "userAgent", "user_agent",
  "fbc", "fbp", "fbclid", "city",
  "encryptionKey", "encryption_key", "authSecret",
  "DATABASE_URL", "AUTH_SECRET", "ENCRYPTION_KEY",
])

/** Masks the middle section of a string: ab***xy */
export function maskMiddle(s: string): string {
  if (s.length <= 4) return "****"
  return s.slice(0, 2) + "****" + s.slice(-2)
}

/**
 * Recursively walks an object and replaces PII field values with "[REDACTED]".
 * Returns a new object — does not mutate the original.
 */
export function redactForLog(obj: unknown, depth = 0): unknown {
  if (depth > 8) return "[DEPTH_LIMIT]"
  if (obj === null || obj === undefined) return obj
  if (typeof obj === "string") return obj
  if (typeof obj === "number" || typeof obj === "boolean") return obj
  if (Array.isArray(obj)) return obj.map((item) => redactForLog(item, depth + 1))
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = PII_KEYS.has(k) || PII_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : redactForLog(v, depth + 1)
    }
    return result
  }
  return obj
}

/**
 * Extracts a safe, non-PII error summary from an unknown error value.
 * Never includes stack trace or internal error messages in production.
 */
export function safeErrorSummary(err: unknown): string {
  if (err instanceof Error) {
    // Only expose the error name (class), not the message (may contain PII or secrets)
    return `[${err.name ?? "Error"}]`
  }
  return "[UnknownError]"
}

/**
 * Produces a public-safe error response body.
 * Never leaks internal error details, stack traces, or field values.
 */
export function publicErrorBody(correlationId: string, userMessage?: string) {
  return {
    error: userMessage ?? "The request could not be processed.",
    correlationId,
  }
}

/**
 * Checks that a string is not a known secret pattern.
 * Used in tests to verify no secrets appear in client bundles.
 */
export function looksLikeSecret(s: string): boolean {
  return (
    // Long hex strings (potential keys)
    /^[0-9a-f]{32,}$/.test(s) ||
    // Base64-encoded secrets
    /^[A-Za-z0-9+/]{40,}={0,2}$/.test(s) ||
    // Common secret prefixes
    /^(sk_|pk_|slk_|pub_|eyJ)/.test(s)
  )
}

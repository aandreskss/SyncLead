// ─── Error monitoring interface ───────────────────────────────────────────────
// Placeholder implementation — logs to console in structured JSON.
//
// PENDING DECISION: Select an error monitoring provider before production launch.
// Options: Sentry (https://sentry.io), Axiom (https://axiom.co), Highlight.io,
//          or Vercel's built-in observability. Once chosen, replace `captureToProvider`
//          with the provider SDK call. The interface below stays stable.
//
// Rules for all implementations:
//   1. Never log passwords, tokens, or encryption keys.
//   2. Always include correlationId for request tracing.
//   3. User identifiers (userId, orgId) are acceptable — they are not PII in logs.
//   4. Email, phone, name, IP must NOT appear in error contexts.

import { redactForLog } from "./redact"

export type ErrorLevel = "error" | "warning" | "info"

export interface ErrorContext {
  correlationId?: string
  orgId?: string
  userId?: string
  action?: string
  resourceType?: string
  resourceId?: string
  /** Additional context — PII will be stripped before logging */
  extra?: Record<string, unknown>
}

/** Capture an unexpected error with sanitized context */
export function captureError(err: unknown, ctx: ErrorContext = {}): void {
  const safe = {
    level: "error" as const,
    name: err instanceof Error ? err.name : "UnknownError",
    // Message intentionally omitted in this default impl — may contain PII
    ...ctx,
    extra: ctx.extra ? redactForLog(ctx.extra) : undefined,
    ts: new Date().toISOString(),
  }
  console.error("[monitor]", JSON.stringify(safe))
  // PROVIDER_HOOK: captureToProvider("error", safe, err)
}

/** Capture a non-error event (rate limit hit, suspicious pattern, etc.) */
export function captureMessage(msg: string, level: ErrorLevel = "info", ctx: ErrorContext = {}): void {
  const safe = {
    level,
    msg,
    ...ctx,
    extra: ctx.extra ? redactForLog(ctx.extra) : undefined,
    ts: new Date().toISOString(),
  }
  if (level === "error") console.error("[monitor]", JSON.stringify(safe))
  else if (level === "warning") console.warn("[monitor]", JSON.stringify(safe))
  else console.info("[monitor]", JSON.stringify(safe))
  // PROVIDER_HOOK: captureToProvider(level, safe)
}

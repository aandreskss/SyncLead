import "server-only"
import { db } from "@/lib/db"
import { metaEvents } from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { decryptTokenVersioned } from "@/lib/crypto"
import { getActiveMetaConnectionByPixelId } from "@/domains/meta/repository"
import { classifyMetaErrorCode, classifyHttpStatus, type SendResult } from "./classify"
import { nextRetryAt, DEFAULT_MAX_ATTEMPTS } from "./backoff"
import type { MetaEvent } from "@/lib/db/schema"

const META_GRAPH_BASE = "https://graph.facebook.com"
const LOCK_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

// ─── Send to Meta ─────────────────────────────────────────────────────────────

async function sendToMeta(
  accessToken: string,
  pixelId: string,
  graphApiVersion: string,
  payload: Record<string, unknown>
): Promise<SendResult> {
  const apiVersion = graphApiVersion || process.env.META_GRAPH_API_VERSION || "v19.0"
  const testEventCode = process.env.META_TEST_EVENT_CODE

  const body: Record<string, unknown> = { data: [payload] }
  const isNonProdEnv = process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview"
  if (testEventCode && isNonProdEnv) {
    body.test_event_code = testEventCode
  }

  let httpStatus = 0
  try {
    const res = await fetch(`${META_GRAPH_BASE}/${apiVersion}/${pixelId}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    httpStatus = res.status
    const json = await res.json() as {
      events_received?: number
      fbtrace_id?: string
      messages?: string[]
      error?: { code?: number; message?: string; fbtrace_id?: string }
    }

    if (res.ok) {
      const received = json.events_received ?? 0
      if (received < 1) {
        // HTTP 200 but Meta reports 0 events — treat as failure
        return {
          success: false,
          httpStatus,
          eventsReceived: 0,
          fbtrace: json.fbtrace_id ?? null,
          messages: json.messages ?? [],
          errorCode: null,
          errorClass: "retryable",
          summary: `received:0 fbtrace:${json.fbtrace_id ?? "none"}`,
        }
      }
      return {
        success: true,
        httpStatus,
        eventsReceived: received,
        fbtrace: json.fbtrace_id ?? null,
        messages: json.messages ?? [],
        errorCode: null,
        errorClass: "retryable",
        summary: `sent:${received} fbtrace:${json.fbtrace_id ?? "none"}`,
      }
    }

    const errorCode = json.error?.code ?? null
    const fbtrace = json.error?.fbtrace_id ?? json.fbtrace_id ?? null
    const errorClass = errorCode != null
      ? classifyMetaErrorCode(errorCode)
      : classifyHttpStatus(httpStatus)

    return {
      success: false,
      httpStatus,
      eventsReceived: null,
      fbtrace,
      messages: [],
      errorCode,
      errorClass,
      summary: `http:${httpStatus} code:${errorCode ?? "none"} fbtrace:${fbtrace ?? "none"}`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 80) : "network_error"
    return {
      success: false,
      httpStatus,
      eventsReceived: null,
      fbtrace: null,
      messages: [],
      errorCode: null,
      errorClass: "retryable",
      summary: `fetch_error:${message}`,
    }
  }
}

// ─── Status updaters ──────────────────────────────────────────────────────────

async function markSent(event: MetaEvent, result: SendResult): Promise<void> {
  await db
    .update(metaEvents)
    .set({
      status: "sent",
      attemptCount: event.attemptCount + 1,
      lockedUntil: null,
      nextAttemptAt: null,
      lastResponse: result.summary.slice(0, 500),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(and(eq(metaEvents.id, event.id), eq(metaEvents.orgId, event.orgId)))
}

async function markRetrying(event: MetaEvent, result: SendResult): Promise<void> {
  const nextAttempt = event.attemptCount + 1
  await db
    .update(metaEvents)
    .set({
      status: "retrying",
      attemptCount: nextAttempt,
      lockedUntil: null,
      nextAttemptAt: nextRetryAt(nextAttempt),
      lastError: result.summary.slice(0, 500),
      lastResponse: result.summary.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(and(eq(metaEvents.id, event.id), eq(metaEvents.orgId, event.orgId)))
}

async function markFailed(event: MetaEvent, result: SendResult): Promise<void> {
  await db
    .update(metaEvents)
    .set({
      status: "failed",
      attemptCount: event.attemptCount + 1,
      lockedUntil: null,
      nextAttemptAt: null,
      lastError: result.summary.slice(0, 500),
      lastResponse: result.summary.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(and(eq(metaEvents.id, event.id), eq(metaEvents.orgId, event.orgId)))
}

async function markSkipped(event: MetaEvent, reason: string): Promise<void> {
  await db
    .update(metaEvents)
    .set({
      status: "skipped",
      lockedUntil: null,
      lastError: reason,
      updatedAt: new Date(),
    })
    .where(and(eq(metaEvents.id, event.id), eq(metaEvents.orgId, event.orgId)))
}

// ─── Direct send (for immediate post-registration attempt) ───────────────────

/**
 * Sends a specific meta_event without the worker claim mechanism.
 * Safe to call from the action that just created the event (no concurrency risk yet).
 * Does NOT affect the sale success — all errors are caught and returned.
 */
export async function sendMetaEventDirect(
  metaEventId: string,
  orgId: string
): Promise<{ sent: boolean; status: string }> {
  const event = await db.query.metaEvents.findFirst({
    where: and(eq(metaEvents.id, metaEventId), eq(metaEvents.orgId, orgId)),
  })
  if (!event || !event.pixelId) return { sent: false, status: "not_found" }
  if (event.status === "sent") return { sent: true, status: "already_sent" }

  const conn = await getActiveMetaConnectionByPixelId(event.pixelId, orgId)
  if (!conn?.accessTokenEnc) {
    await markSkipped(event, "no_active_connection")
    return { sent: false, status: "no_connection" }
  }

  let accessToken: string
  try {
    accessToken = decryptTokenVersioned(conn.accessTokenEnc)
  } catch {
    await markFailed(event, {
      success: false, httpStatus: 0, eventsReceived: null,
      fbtrace: null, messages: [], errorCode: null,
      errorClass: "permanent", summary: "decrypt_error",
    })
    return { sent: false, status: "decrypt_error" }
  }

  const result = await sendToMeta(accessToken, event.pixelId, conn.graphApiVersion, event.payload)

  if (result.success) {
    await markSent(event, result)
    return { sent: true, status: result.summary }
  }

  const maxAttempts = DEFAULT_MAX_ATTEMPTS
  if (result.errorClass === "permanent" || event.attemptCount >= maxAttempts - 1) {
    await markFailed(event, result)
    return { sent: false, status: result.summary }
  }

  // Leave as pending (not retrying yet — first attempt)
  await db
    .update(metaEvents)
    .set({ attemptCount: event.attemptCount + 1, lastError: result.summary.slice(0, 500), updatedAt: new Date() })
    .where(and(eq(metaEvents.id, event.id), eq(metaEvents.orgId, orgId)))

  return { sent: false, status: result.summary }
}

// ─── Worker (for cron) ────────────────────────────────────────────────────────

export interface WorkerResult {
  processed: number
  sent: number
  retried: number
  failed: number
  skipped: number
}

/**
 * Claims and processes one pending/retrying meta_event atomically.
 * Safe to call concurrently: the subquery UPDATE is atomic in PostgreSQL —
 * only one worker wins per row even without FOR UPDATE SKIP LOCKED.
 */
export async function processOneMetaEvent(): Promise<WorkerResult & { found: boolean }> {
  const now = new Date()
  const lockUntil = new Date(now.getTime() + LOCK_TIMEOUT_MS)

  // Atomic claim: subquery UPDATE ensures only one worker wins per row
  const [event] = await db
    .update(metaEvents)
    .set({ status: "processing", lockedUntil: lockUntil, updatedAt: now })
    .where(
      sql`id = (
        SELECT id FROM meta_events
        WHERE status IN ('pending', 'retrying')
          AND (locked_until IS NULL OR locked_until < ${now})
          AND (next_attempt_at IS NULL OR next_attempt_at <= ${now})
        ORDER BY next_attempt_at ASC NULLS FIRST, created_at ASC
        LIMIT 1
      )`
    )
    .returning()

  if (!event) return { found: false, processed: 0, sent: 0, retried: 0, failed: 0, skipped: 0 }

  // Release orphaned locks older than LOCK_TIMEOUT — separate pass, non-fatal
  db.update(metaEvents)
    .set({ status: "pending", lockedUntil: null, updatedAt: new Date() })
    .where(
      sql`status = 'processing' AND locked_until < ${new Date(now.getTime() - LOCK_TIMEOUT_MS)} AND id != ${event.id}`
    )
    .catch(() => undefined)

  if (!event.pixelId) {
    await markSkipped(event, "no_pixel_id")
    return { found: true, processed: 1, sent: 0, retried: 0, failed: 0, skipped: 1 }
  }

  const conn = await getActiveMetaConnectionByPixelId(event.pixelId, event.orgId)
  if (!conn?.accessTokenEnc) {
    await markSkipped(event, "no_active_connection")
    return { found: true, processed: 1, sent: 0, retried: 0, failed: 0, skipped: 1 }
  }

  let accessToken: string
  try {
    accessToken = decryptTokenVersioned(conn.accessTokenEnc)
  } catch {
    await markFailed(event, {
      success: false, httpStatus: 0, eventsReceived: null,
      fbtrace: null, messages: [], errorCode: null,
      errorClass: "permanent", summary: "decrypt_error",
    })
    return { found: true, processed: 1, sent: 0, retried: 0, failed: 1, skipped: 0 }
  }

  const result = await sendToMeta(accessToken, event.pixelId, conn.graphApiVersion, event.payload)

  if (result.success) {
    await markSent(event, result)
    return { found: true, processed: 1, sent: 1, retried: 0, failed: 0, skipped: 0 }
  }

  const maxAttempts = DEFAULT_MAX_ATTEMPTS
  const isPermanent = result.errorClass === "permanent"
  const isDeadLetter = event.attemptCount + 1 >= maxAttempts

  if (isPermanent || isDeadLetter) {
    await markFailed(event, result)
    return { found: true, processed: 1, sent: 0, retried: 0, failed: 1, skipped: 0 }
  }

  await markRetrying(event, result)
  return { found: true, processed: 1, sent: 0, retried: 1, failed: 0, skipped: 0 }
}

/**
 * Runs the worker in a loop processing up to `batchSize` events.
 * Returns aggregate counts.
 */
export async function processMetaOutbox(batchSize = 50): Promise<WorkerResult> {
  const totals: WorkerResult = { processed: 0, sent: 0, retried: 0, failed: 0, skipped: 0 }
  for (let i = 0; i < batchSize; i++) {
    const r = await processOneMetaEvent()
    if (!r.found) break
    totals.processed += r.processed
    totals.sent += r.sent
    totals.retried += r.retried
    totals.failed += r.failed
    totals.skipped += r.skipped
  }
  return totals
}

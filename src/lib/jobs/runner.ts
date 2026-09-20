import "server-only"
import { db } from "@/lib/db"
import { cronRuns } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { randomUUID } from "crypto"

export interface JobRunContext {
  /** Unique ID for this execution — include in all related log lines. No PII. */
  correlationId: string
  /** Returns true if the elapsed time has exceeded budgetMs. Use inside loops to avoid timeout. */
  isOverBudget: (budgetMs: number) => boolean
}

export interface JobRunResult {
  itemsProcessed?: number
  itemsFailed?: number
  /** Safe, non-PII summary stored in cron_runs.result */
  result?: Record<string, unknown>
}

/**
 * Wraps a cron job function with DB-backed observability.
 *
 * Creates a `cron_runs` row on start and updates it with status/duration/result
 * on completion or failure. Errors in the recording layer are swallowed — the
 * primary job always runs regardless of DB availability for the cron table.
 */
export async function withJobRun(
  jobName: string,
  fn: (ctx: JobRunContext) => Promise<JobRunResult>
): Promise<{ correlationId: string; ok: boolean; durationMs: number; error?: string }> {
  const correlationId = randomUUID()
  const startedAt = Date.now()

  let runId: string | undefined
  try {
    const [run] = await db
      .insert(cronRuns)
      .values({ jobName, correlationId, status: "running" })
      .returning({ id: cronRuns.id })
    runId = run.id
  } catch {
    // Non-fatal: if we can't write the start record, still run the job
  }

  const ctx: JobRunContext = {
    correlationId,
    isOverBudget: (budgetMs: number) => Date.now() - startedAt > budgetMs,
  }

  try {
    const jobResult = await fn(ctx)
    const durationMs = Date.now() - startedAt

    if (runId) {
      await db
        .update(cronRuns)
        .set({
          status: "completed",
          completedAt: new Date(),
          durationMs,
          itemsProcessed: jobResult.itemsProcessed ?? 0,
          itemsFailed: jobResult.itemsFailed ?? 0,
          result: jobResult.result ?? {},
        })
        .where(eq(cronRuns.id, runId))
        .catch(() => undefined)
    }

    return { correlationId, ok: true, durationMs }
  } catch (err) {
    const durationMs = Date.now() - startedAt
    // Only log error name — message may contain PII or secrets
    const errorSummary = err instanceof Error ? err.name : "unknown_error"

    if (runId) {
      await db
        .update(cronRuns)
        .set({
          status: "failed",
          completedAt: new Date(),
          durationMs,
          error: errorSummary.slice(0, 500),
        })
        .where(eq(cronRuns.id, runId))
        .catch(() => undefined)
    }

    return { correlationId, ok: false, durationMs, error: errorSummary }
  }
}

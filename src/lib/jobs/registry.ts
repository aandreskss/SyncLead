/** Metadata for every registered background job. Single source of truth. */
export interface JobMeta {
  name: string
  description: string
  /** Cron schedule (UTC). Human-readable; not parsed by this code. */
  schedule: string
  /** Vercel maxDuration for the route (seconds) */
  maxDurationSec: number
  /** Time budget for loop-based work inside the job (ms). Always < maxDurationSec * 1000. */
  timeBudgetMs: number
  /** Minimum minutes between runs that is safe (idempotency note) */
  minIntervalMin: number
}

export const JOB_REGISTRY: Record<string, JobMeta> = {
  "meta-outbox": {
    name: "meta-outbox",
    description: "Deliver pending/retrying Meta CAPI events with exponential backoff",
    schedule: "every 10 minutes",
    maxDurationSec: 60,
    timeBudgetMs: 50_000,
    minIntervalMin: 5,
  },
  "meta-insights-sync": {
    name: "meta-insights-sync",
    description: "Incremental sync of Meta Ads Insights for all active connections",
    schedule: "daily 03:00 UTC",
    maxDurationSec: 60,
    timeBudgetMs: 50_000,
    minIntervalMin: 60,
  },
  "cleanup": {
    name: "cleanup",
    description: "Delete webhook_events older than 30 days",
    schedule: "daily 04:00 UTC",
    maxDurationSec: 30,
    timeBudgetMs: 25_000,
    minIntervalMin: 60,
  },
  "retention-cleanup": {
    name: "retention-cleanup",
    description: "Nullify expired IP/UA fields; erase PII for deletion-requested leads",
    schedule: "daily 03:00 UTC",
    maxDurationSec: 60,
    timeBudgetMs: 50_000,
    minIntervalMin: 60,
  },
  "monthly-reports": {
    name: "monthly-reports",
    description: "Send monthly report emails to org owners with the previous month's data",
    schedule: "1st of month 08:00 UTC",
    maxDurationSec: 60,
    timeBudgetMs: 50_000,
    minIntervalMin: 43_200,
  },
} as const

export type JobName = keyof typeof JOB_REGISTRY

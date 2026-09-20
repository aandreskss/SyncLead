-- ─── Prompt 22: Job observability — cron_runs table ──────────────────────────
-- Every cron execution is recorded here for health monitoring and runbook diagnostics.
-- Purely additive; no existing tables modified.

CREATE TYPE cron_run_status AS ENUM ('running', 'completed', 'failed', 'timeout');

CREATE TABLE IF NOT EXISTS cron_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name        text NOT NULL,
  correlation_id  text NOT NULL,
  status          cron_run_status NOT NULL DEFAULT 'running',
  started_at      timestamptz NOT NULL DEFAULT NOW(),
  completed_at    timestamptz,
  duration_ms     integer,
  items_processed integer NOT NULL DEFAULT 0,
  items_failed    integer NOT NULL DEFAULT 0,
  result          jsonb NOT NULL DEFAULT '{}',
  error           text
);

CREATE INDEX IF NOT EXISTS cron_runs_job_name_idx   ON cron_runs (job_name);
CREATE INDEX IF NOT EXISTS cron_runs_started_at_idx ON cron_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS cron_runs_status_idx     ON cron_runs (status) WHERE status IN ('running', 'failed', 'timeout');

-- Clean up old completed runs automatically (keep 90 days, handled by retention cron)
-- No explicit partition; simple timestamp index is sufficient at current scale.

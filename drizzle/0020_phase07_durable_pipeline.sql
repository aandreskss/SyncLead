-- Phase 07: Durable pipeline enhancements
-- Additive only — no data loss, safe to apply against a running production database.

-- (a) Lease token for worker fencing.
-- When a worker claims a queue item it writes a UUID into this column.
-- All subsequent mutations on the same row must supply the matching token in the
-- WHERE clause; a stale worker whose item was orphan-recovered and re-claimed by a
-- newer worker will see 0 rows updated and gracefully do nothing.
ALTER TABLE ai_message_queue
  ADD COLUMN IF NOT EXISTS lease_token uuid;

-- (b) Partial index for efficient orphan detection.
-- Allows the orphan-recovery step to scan only rows with status = 'processing'
-- filtered by claimed_at without touching every row in the table.
CREATE INDEX IF NOT EXISTS ai_message_queue_orphan_idx
  ON ai_message_queue(claimed_at)
  WHERE status = 'processing';

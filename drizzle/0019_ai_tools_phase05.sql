-- Phase 05: idempotency key for AI tool executions
-- Partial unique index: NULL values don't conflict, so pre-Phase-05 rows are unaffected.
ALTER TABLE ai_tool_executions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ai_tool_executions_idem_key_idx
  ON ai_tool_executions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

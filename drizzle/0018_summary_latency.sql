-- Gap fixes: conversation summary + message count + usage latency
-- Additive only — no drops, no renames.

-- Add summary and message counter to wa_conversations
ALTER TABLE wa_conversations
  ADD COLUMN IF NOT EXISTS summary         text,
  ADD COLUMN IF NOT EXISTS message_count   integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN wa_conversations.summary IS
  'Rolling AI-generated summary of confirmed data, current state and pending actions. Regenerated every N AI messages to preserve context beyond the history window.';

COMMENT ON COLUMN wa_conversations.message_count IS
  'Running total of all messages (inbound + outbound) for this conversation. Drives summary regeneration logic.';

-- Add latency tracking to ai_usage_records
ALTER TABLE ai_usage_records
  ADD COLUMN IF NOT EXISTS latency_ms integer;

COMMENT ON COLUMN ai_usage_records.latency_ms IS
  'Wall-clock milliseconds from engine start to first token received. Null if not measured.';

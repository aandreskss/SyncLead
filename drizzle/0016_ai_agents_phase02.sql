-- Phase 02: AI Agents Extended Schema
-- Additive migration — all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- Apply with: npx drizzle-kit push
-- DO NOT apply against production automatically — verify environment first.

-- ─── 1. wa_conversations: control mode + closed_at ───────────────────────────
-- control_mode separates AI/human control from the CRM lifecycle (open/closed).
-- Values: ai | waiting_human | human | paused
ALTER TABLE wa_conversations
  ADD COLUMN IF NOT EXISTS control_mode text NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE INDEX IF NOT EXISTS wa_conversations_control_mode_idx
  ON wa_conversations (org_id, control_mode);

-- ─── 2. Cross-tenant uniqueness guards ───────────────────────────────────────
-- A Meta phone_number_id belongs to exactly one business globally.
-- Prevents the same physical number from being registered under two orgs.
CREATE UNIQUE INDEX IF NOT EXISTS wa_phone_numbers_phone_number_id_global_idx
  ON wa_phone_numbers (phone_number_id);

-- A WABA ID belongs to exactly one Meta Business; enforce the same here.
CREATE UNIQUE INDEX IF NOT EXISTS wa_business_accounts_waba_id_global_idx
  ON wa_business_accounts (waba_id);

-- ─── 3. ai_agent_versions ────────────────────────────────────────────────────
-- Immutable published snapshots of an ai_agent config.
-- Draft lifecycle: draft → published (one at a time) → archived.
-- A partial unique index ensures only one published version per agent.
CREATE TABLE IF NOT EXISTS ai_agent_versions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id      uuid        NOT NULL REFERENCES ai_agents(id)     ON DELETE CASCADE,
  version_number integer    NOT NULL,
  -- Full immutable snapshot of agent config at publish time.
  -- Stored here so config changes don't silently affect active episodes.
  snapshot      jsonb       NOT NULL DEFAULT '{}',
  status        text        NOT NULL DEFAULT 'draft', -- draft | published | archived
  published_at  timestamptz,
  published_by  text        REFERENCES "user"(id) ON DELETE SET NULL,
  archived_at   timestamptz,
  archived_by   text        REFERENCES "user"(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_agent_versions_agent_id_idx
  ON ai_agent_versions (agent_id);
CREATE INDEX IF NOT EXISTS ai_agent_versions_org_id_idx
  ON ai_agent_versions (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS ai_agent_versions_agent_version_idx
  ON ai_agent_versions (agent_id, version_number);
-- Atomic publication guard: at most one published version per agent.
-- The publish operation MUST archive the current published version first.
CREATE UNIQUE INDEX IF NOT EXISTS ai_agent_versions_agent_published_idx
  ON ai_agent_versions (agent_id) WHERE status = 'published';

-- ─── 4. ai_knowledge_sources ─────────────────────────────────────────────────
-- Org-scoped knowledge entries. Revocation (not deletion) is the soft-delete mechanism.
-- Episodes store knowledge_snapshot with specific revision IDs;
-- the engine skips any source with status = 'revoked' at retrieval time.
CREATE TABLE IF NOT EXISTS ai_knowledge_sources (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  source_type text        NOT NULL DEFAULT 'text', -- text | url | file
  content     text,        -- mutable for type=text; create a revision on each change
  url         text,        -- for type=url
  file_key    text,        -- storage reference for type=file
  status      text        NOT NULL DEFAULT 'active', -- active | revoked
  revoked_at  timestamptz,
  revoked_by  text        REFERENCES "user"(id) ON DELETE SET NULL,
  created_by  text        REFERENCES "user"(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_knowledge_sources_org_id_idx
  ON ai_knowledge_sources (org_id);
CREATE INDEX IF NOT EXISTS ai_knowledge_sources_status_idx
  ON ai_knowledge_sources (org_id, status);

-- ─── 5. ai_knowledge_revisions ───────────────────────────────────────────────
-- Immutable content snapshots of a knowledge source.
-- Created each time source content changes; referenced by agent versions.
CREATE TABLE IF NOT EXISTS ai_knowledge_revisions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id       uuid        NOT NULL REFERENCES ai_knowledge_sources(id) ON DELETE CASCADE,
  revision_number integer     NOT NULL,
  content_hash    text        NOT NULL, -- SHA-256(content) for change detection / dedup
  content         text        NOT NULL, -- immutable snapshot
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_knowledge_revisions_source_id_idx
  ON ai_knowledge_revisions (source_id);
CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_revisions_source_revision_idx
  ON ai_knowledge_revisions (source_id, revision_number);

-- ─── 6. ai_agent_version_knowledge ───────────────────────────────────────────
-- Association: which knowledge revisions an agent version uses.
-- ON DELETE RESTRICT on source + revision: revoke (don't delete) linked sources.
-- Cross-tenant guard: org_id must match; enforced at application layer.
CREATE TABLE IF NOT EXISTS ai_agent_version_knowledge (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_version_id      uuid        NOT NULL REFERENCES ai_agent_versions(id)     ON DELETE CASCADE,
  knowledge_source_id   uuid        NOT NULL REFERENCES ai_knowledge_sources(id)  ON DELETE RESTRICT,
  knowledge_revision_id uuid        NOT NULL REFERENCES ai_knowledge_revisions(id) ON DELETE RESTRICT,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_agent_version_knowledge_version_idx
  ON ai_agent_version_knowledge (agent_version_id);
-- At most one revision per source per version.
CREATE UNIQUE INDEX IF NOT EXISTS ai_agent_version_knowledge_version_source_idx
  ON ai_agent_version_knowledge (agent_version_id, knowledge_source_id);

-- ─── 7. ai_campaign_rules ────────────────────────────────────────────────────
-- Which campaigns a deployment handles and at what priority.
-- campaign_id = NULL means catch-all (applies to any campaign on this deployment).
-- Constraints prevent two competing rules for the same (deployment, campaign) pair.
CREATE TABLE IF NOT EXISTS ai_campaign_rules (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES organizations(id)        ON DELETE CASCADE,
  deployment_id uuid        NOT NULL REFERENCES ai_agent_deployments(id) ON DELETE CASCADE,
  -- NULL = applies to all campaigns for this deployment
  campaign_id   uuid        REFERENCES campaigns(id) ON DELETE CASCADE,
  priority      integer     NOT NULL DEFAULT 0, -- higher = evaluated first
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_campaign_rules_deployment_id_idx
  ON ai_campaign_rules (deployment_id);
CREATE INDEX IF NOT EXISTS ai_campaign_rules_campaign_id_idx
  ON ai_campaign_rules (campaign_id);
-- Only one specific rule per (deployment, campaign) pair.
CREATE UNIQUE INDEX IF NOT EXISTS ai_campaign_rules_dep_campaign_idx
  ON ai_campaign_rules (deployment_id, campaign_id) WHERE campaign_id IS NOT NULL;
-- Only one catch-all rule per deployment.
CREATE UNIQUE INDEX IF NOT EXISTS ai_campaign_rules_dep_catchall_idx
  ON ai_campaign_rules (deployment_id) WHERE campaign_id IS NULL;

-- ─── 8. ai_episodes ──────────────────────────────────────────────────────────
-- Bounded AI work unit per conversation.
-- Fixed at episode start: agent_version_id, campaign_id, knowledge_snapshot.
-- Config changes to the agent do NOT alter active episodes.
CREATE TABLE IF NOT EXISTS ai_episodes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        NOT NULL REFERENCES organizations(id)        ON DELETE CASCADE,
  conversation_id   uuid        NOT NULL REFERENCES wa_conversations(id)     ON DELETE CASCADE,
  -- Immutable reference: this version's snapshot holds the full config used.
  agent_version_id  uuid        NOT NULL REFERENCES ai_agent_versions(id),
  -- Campaign context at episode start (for tool calls and context building).
  campaign_id       uuid        REFERENCES campaigns(id) ON DELETE SET NULL,
  -- Frozen list: [{sourceId, revisionId, revisionNumber}] used when episode started.
  -- Revoked sources: still listed here for audit, but engine skips retrieval.
  knowledge_snapshot jsonb      NOT NULL DEFAULT '[]',
  -- The incoming message that triggered this episode.
  trigger_message_id uuid       REFERENCES wa_conversation_messages(id) ON DELETE SET NULL,
  status            text        NOT NULL DEFAULT 'active', -- active | ended
  -- Why the episode ended (NULL while active).
  -- Values: objective_met | human_requested | transfer_rule | inactivity | error | budget | limit
  exit_reason       text,
  exit_detail       text, -- human-readable, sanitized (no raw API errors)
  started_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  -- Aggregate LLM usage for this episode (updated by ai_usage_records inserts).
  token_count_in    integer     NOT NULL DEFAULT 0,
  token_count_out   integer     NOT NULL DEFAULT 0,
  -- Actual model string used (copied from snapshot at start; immutable).
  model_used        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_episodes_org_id_idx
  ON ai_episodes (org_id);
CREATE INDEX IF NOT EXISTS ai_episodes_conversation_id_idx
  ON ai_episodes (conversation_id);
CREATE INDEX IF NOT EXISTS ai_episodes_agent_version_id_idx
  ON ai_episodes (agent_version_id);
CREATE INDEX IF NOT EXISTS ai_episodes_status_idx
  ON ai_episodes (org_id, status);

-- ─── 9. ai_message_queue ─────────────────────────────────────────────────────
-- Durable outbox for async AI processing (same claim-atomic pattern as meta_events).
-- Claim atomic UPDATE: SET status='processing' WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)
-- Deduplication: one queue item per incoming message (UNIQUE on incoming_message_id).
CREATE TABLE IF NOT EXISTS ai_message_queue (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid        NOT NULL REFERENCES organizations(id)             ON DELETE CASCADE,
  conversation_id     uuid        NOT NULL REFERENCES wa_conversations(id)          ON DELETE CASCADE,
  incoming_message_id uuid        NOT NULL REFERENCES wa_conversation_messages(id)  ON DELETE CASCADE,
  -- FSM: enqueued → processing → done
  --              └─► failed ──(backoff retry)──► processing
  --                            └─► dead_letter (attempt_count >= max)
  status              text        NOT NULL DEFAULT 'enqueued',
  attempt_count       integer     NOT NULL DEFAULT 0,
  claim_at            timestamptz NOT NULL DEFAULT now(), -- supports exponential backoff
  claimed_at          timestamptz,
  claimed_by          text,   -- correlation ID of the worker (never PII)
  error_last          text,   -- sanitized error from last attempt
  dead_lettered_at    timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_message_queue_org_id_idx
  ON ai_message_queue (org_id);
CREATE INDEX IF NOT EXISTS ai_message_queue_status_claim_idx
  ON ai_message_queue (status, claim_at);
CREATE INDEX IF NOT EXISTS ai_message_queue_conversation_id_idx
  ON ai_message_queue (conversation_id);
-- Deduplication: prevents the same incoming message from being queued twice.
CREATE UNIQUE INDEX IF NOT EXISTS ai_message_queue_message_id_idx
  ON ai_message_queue (incoming_message_id);

-- ─── 10. ai_tool_executions ──────────────────────────────────────────────────
-- Audit log of every CRM tool call made by an AI episode.
-- No raw LLM output stored here — only structured tool results.
CREATE TABLE IF NOT EXISTS ai_tool_executions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES organizations(id)    ON DELETE CASCADE,
  episode_id      uuid        NOT NULL REFERENCES ai_episodes(id)      ON DELETE CASCADE,
  conversation_id uuid        NOT NULL REFERENCES wa_conversations(id),
  tool_name       text        NOT NULL,
  input           jsonb       NOT NULL DEFAULT '{}',
  output          jsonb,      -- null if status = error
  status          text        NOT NULL DEFAULT 'success', -- success | error
  duration_ms     integer,
  error_detail    text, -- sanitized (no PII, no raw API messages)
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_tool_executions_episode_id_idx
  ON ai_tool_executions (episode_id);
CREATE INDEX IF NOT EXISTS ai_tool_executions_org_id_idx
  ON ai_tool_executions (org_id);
CREATE INDEX IF NOT EXISTS ai_tool_executions_conversation_id_idx
  ON ai_tool_executions (conversation_id);

-- ─── 11. ai_usage_records ────────────────────────────────────────────────────
-- LLM consumption tracking per episode turn (one row per LLM call).
-- Allows cost attribution per org, agent, and model over time.
CREATE TABLE IF NOT EXISTS ai_usage_records (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES organizations(id)    ON DELETE CASCADE,
  episode_id      uuid        NOT NULL REFERENCES ai_episodes(id)      ON DELETE CASCADE,
  conversation_id uuid        NOT NULL REFERENCES wa_conversations(id),
  provider        text        NOT NULL, -- anthropic | openai | google
  model           text        NOT NULL, -- full model name (e.g., claude-sonnet-4-6)
  input_tokens    integer     NOT NULL DEFAULT 0,
  output_tokens   integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_records_episode_id_idx
  ON ai_usage_records (episode_id);
CREATE INDEX IF NOT EXISTS ai_usage_records_org_id_idx
  ON ai_usage_records (org_id);
CREATE INDEX IF NOT EXISTS ai_usage_records_created_at_idx
  ON ai_usage_records (org_id, created_at);

-- Phase 09: Usage ledger, pricing tiers, budget limits and reservations

-- Pricing tiers: configurable versioned rates with source provenance.
-- 'anthropic_published' = rates from Anthropic's public pricing page.
-- Callbell's internal negotiated rates are NOT stored here (different cost center).
-- 1 millicent = 1/100,000 USD. Rate stored per-token.
CREATE TABLE "ai_pricing_tiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "display_name" text NOT NULL,
  "input_millicents_per_token" bigint NOT NULL,
  "output_millicents_per_token" bigint NOT NULL,
  "cache_read_millicents_per_token" bigint,
  "cache_write_millicents_per_token" bigint,
  "source" text NOT NULL DEFAULT 'anthropic_published',
  "note" text,
  "effective_from" timestamptz NOT NULL DEFAULT now(),
  "effective_to" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "ai_pricing_tiers_provider_model_idx"
  ON "ai_pricing_tiers" ("provider", "model", "effective_from" DESC);

-- Seed: Anthropic published rates as of 2026-10-10
-- Sonnet 4.6: $3.00/1M input = 300 mc/token; $15.00/1M output = 1500 mc/token
--             $0.30/1M cache_read = 30 mc/token; $3.75/1M cache_write = 375 mc/token
-- Haiku 4.5:  $0.80/1M input = 80 mc/token; $4.00/1M output = 400 mc/token
--             $0.08/1M cache_read = 8 mc/token; $1.00/1M cache_write = 100 mc/token
INSERT INTO "ai_pricing_tiers"
  ("provider","model","display_name","input_millicents_per_token","output_millicents_per_token",
   "cache_read_millicents_per_token","cache_write_millicents_per_token","source","note")
VALUES
  ('anthropic','claude-sonnet-4-6','Claude Sonnet 4.6',300,1500,30,375,
   'anthropic_published','Anthropic published rates 2026-10-10. Callbell internal rates differ.'),
  ('anthropic','claude-haiku-4-5-20251001','Claude Haiku 4.5',80,400,8,100,
   'anthropic_published','Anthropic published rates 2026-10-10.');

-- Extend ai_usage_records with cost and cache fields
ALTER TABLE "ai_usage_records"
  ADD COLUMN IF NOT EXISTS "cache_read_tokens" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cache_write_tokens" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "input_cost_millicents" bigint,
  ADD COLUMN IF NOT EXISTS "output_cost_millicents" bigint,
  ADD COLUMN IF NOT EXISTS "cache_read_cost_millicents" bigint,
  ADD COLUMN IF NOT EXISTS "cache_write_cost_millicents" bigint,
  ADD COLUMN IF NOT EXISTS "total_cost_millicents" bigint,
  ADD COLUMN IF NOT EXISTS "pricing_tier_id" uuid
    REFERENCES "ai_pricing_tiers"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "is_sandbox" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "call_type" text NOT NULL DEFAULT 'inference';

-- Composite index for analytics (org + time range + sandbox filter)
CREATE INDEX IF NOT EXISTS "ai_usage_records_analytics_idx"
  ON "ai_usage_records" ("org_id", "created_at" DESC, "is_sandbox");

-- Budget limits per org (one row per org, enforced via UNIQUE)
CREATE TABLE "ai_budget_limits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL UNIQUE REFERENCES "organizations"("id") ON DELETE CASCADE,
  "daily_limit_millicents" bigint,
  "monthly_limit_millicents" bigint,
  "per_conversation_limit_millicents" bigint,
  "alert_threshold_pct" integer NOT NULL DEFAULT 80,
  "pause_on_exhaust" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Budget reservations: conservative estimate reserved before engine execution.
-- Settled to 'consumed' (with usage_record_id) or 'released' after each run.
-- ON DELETE CASCADE from queue_item ensures reservation auto-releases with queue item.
CREATE TABLE "ai_budget_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "queue_item_id" uuid NOT NULL UNIQUE REFERENCES "ai_message_queue"("id") ON DELETE CASCADE,
  "episode_id" uuid REFERENCES "ai_episodes"("id") ON DELETE SET NULL,
  "reserved_millicents" bigint NOT NULL,
  "status" text NOT NULL DEFAULT 'reserved',
  "released_reason" text,
  "reserved_at" timestamptz NOT NULL DEFAULT now(),
  "settled_at" timestamptz,
  "usage_record_id" uuid REFERENCES "ai_usage_records"("id") ON DELETE SET NULL
);

CREATE INDEX "ai_budget_reservations_org_status_idx"
  ON "ai_budget_reservations" ("org_id", "status");
-- Partial index for orphan cleanup (only active reservations need scanning)
CREATE INDEX "ai_budget_reservations_orphan_idx"
  ON "ai_budget_reservations" ("reserved_at")
  WHERE "status" = 'reserved';

-- Analytics performance indexes on episodes
CREATE INDEX IF NOT EXISTS "ai_episodes_org_started_idx"
  ON "ai_episodes" ("org_id", "started_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_episodes_org_campaign_idx"
  ON "ai_episodes" ("org_id", "campaign_id");
CREATE INDEX IF NOT EXISTS "ai_episodes_exit_reason_idx"
  ON "ai_episodes" ("org_id", "exit_reason")
  WHERE "status" = 'ended';

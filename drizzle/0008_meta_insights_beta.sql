-- ─── Prompt 18: Meta Ads Insights beta (internal_manual mode) ─────────────────
-- All operations are additive (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- 1. New enum: meta_connection_mode
DO $$ BEGIN
  CREATE TYPE meta_connection_mode AS ENUM ('internal_manual', 'external_oauth');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. meta_connections: ad account + connection mode
ALTER TABLE meta_connections
  ADD COLUMN IF NOT EXISTS ad_account_id text,
  ADD COLUMN IF NOT EXISTS connection_mode meta_connection_mode NOT NULL DEFAULT 'internal_manual';

-- 3. ad_insights_daily: v2 fields for account-scoped upserts
ALTER TABLE ad_insights_daily
  ADD COLUMN IF NOT EXISTS ad_account_id text,
  ADD COLUMN IF NOT EXISTS level text,
  ADD COLUMN IF NOT EXISTS object_id text,
  ADD COLUMN IF NOT EXISTS currency text;

-- v2 compound unique index (NULLs don't match, so legacy rows are unaffected)
CREATE UNIQUE INDEX IF NOT EXISTS ad_insights_v2_unique_idx
  ON ad_insights_daily(org_id, ad_account_id, date, level, object_id);

-- Adset-level index (missing from original schema)
CREATE UNIQUE INDEX IF NOT EXISTS ad_insights_adset_date_idx
  ON ad_insights_daily(org_id, meta_adset_id, date)
  WHERE meta_ad_id IS NULL AND meta_adset_id IS NOT NULL;

-- 4. meta_sync_runs: locking + sync type
ALTER TABLE meta_sync_runs
  ADD COLUMN IF NOT EXISTS ad_account_id text,
  ADD COLUMN IF NOT EXISTS sync_type text,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text;

CREATE INDEX IF NOT EXISTS meta_sync_runs_account_idx
  ON meta_sync_runs(org_id, ad_account_id);

-- 5. meta_ad_account_allowlist
CREATE TABLE IF NOT EXISTS meta_ad_account_allowlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ad_account_id text NOT NULL,
  added_by_id text REFERENCES "user"(id) ON DELETE SET NULL,
  notes       text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, ad_account_id)
);

CREATE INDEX IF NOT EXISTS meta_allowlist_org_id_idx
  ON meta_ad_account_allowlist(org_id);

-- 6. meta_catalog_campaigns
CREATE TABLE IF NOT EXISTS meta_catalog_campaigns (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id            uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ad_account_id        text NOT NULL,
  meta_campaign_id     text NOT NULL,
  name                 text NOT NULL,
  status               text NOT NULL DEFAULT 'UNKNOWN',
  effective_status     text,
  objective            text,
  start_time           timestamptz,
  stop_time            timestamptz,
  daily_budget         numeric(18,2),
  lifetime_budget      numeric(18,2),
  internal_campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  last_synced_at       timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, meta_campaign_id)
);

CREATE INDEX IF NOT EXISTS meta_catalog_campaigns_org_id_idx  ON meta_catalog_campaigns(org_id);
CREATE INDEX IF NOT EXISTS meta_catalog_campaigns_client_id_idx ON meta_catalog_campaigns(client_id);

-- 7. meta_catalog_adsets
CREATE TABLE IF NOT EXISTS meta_catalog_adsets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id        uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ad_account_id    text NOT NULL,
  meta_adset_id    text NOT NULL,
  meta_campaign_id text NOT NULL,
  name             text NOT NULL,
  status           text NOT NULL DEFAULT 'UNKNOWN',
  effective_status text,
  targeting_json   jsonb NOT NULL DEFAULT '{}',
  last_synced_at   timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, meta_adset_id)
);

CREATE INDEX IF NOT EXISTS meta_catalog_adsets_org_id_idx   ON meta_catalog_adsets(org_id);
CREATE INDEX IF NOT EXISTS meta_catalog_adsets_client_id_idx ON meta_catalog_adsets(client_id);

-- 8. meta_catalog_ads
CREATE TABLE IF NOT EXISTS meta_catalog_ads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id        uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ad_account_id    text NOT NULL,
  meta_ad_id       text NOT NULL,
  meta_adset_id    text NOT NULL,
  meta_campaign_id text NOT NULL,
  name             text NOT NULL,
  status           text NOT NULL DEFAULT 'UNKNOWN',
  effective_status text,
  creative_name    text,
  last_synced_at   timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, meta_ad_id)
);

CREATE INDEX IF NOT EXISTS meta_catalog_ads_org_id_idx   ON meta_catalog_ads(org_id);
CREATE INDEX IF NOT EXISTS meta_catalog_ads_client_id_idx ON meta_catalog_ads(client_id);

import { config } from "dotenv"
config({ path: ".env.local" })

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  // ── tracking_sites unique constraint (pending drift from before Phase 09) ──
  console.log("Adding tracking_sites.collect_token unique constraint...")
  await sql`
    ALTER TABLE tracking_sites
      ADD CONSTRAINT tracking_sites_collect_token_unique UNIQUE (collect_token)
  `.catch((e: any) => {
    if (e.message?.includes("already exists")) {
      console.log("  (already exists, skipping)")
    } else throw e
  })

  // ── Phase 09: ai_pricing_tiers ─────────────────────────────────────────────
  console.log("Creating ai_pricing_tiers...")
  await sql`
    CREATE TABLE IF NOT EXISTS ai_pricing_tiers (
      id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider                        TEXT NOT NULL,
      model                           TEXT NOT NULL,
      display_name                    TEXT NOT NULL,
      input_millicents_per_token      BIGINT NOT NULL,
      output_millicents_per_token     BIGINT NOT NULL,
      cache_read_millicents_per_token  BIGINT,
      cache_write_millicents_per_token BIGINT,
      source                          TEXT NOT NULL DEFAULT 'anthropic_published',
      note                            TEXT,
      effective_from                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      effective_to                    TIMESTAMPTZ,
      created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS ai_pricing_tiers_provider_model_idx
      ON ai_pricing_tiers (provider, model, effective_from DESC)
  `

  // Seed rates — idempotent: skip if already seeded for this model
  const existing = await sql`
    SELECT model FROM ai_pricing_tiers WHERE provider = 'anthropic'
  `
  const seeded = new Set(existing.map((r: any) => r.model))

  if (!seeded.has("claude-sonnet-4-6")) {
    await sql`
      INSERT INTO ai_pricing_tiers
        (provider, model, display_name,
         input_millicents_per_token, output_millicents_per_token,
         cache_read_millicents_per_token, cache_write_millicents_per_token,
         source, note)
      VALUES
        ('anthropic', 'claude-sonnet-4-6', 'Claude Sonnet 4.6',
         300, 1500, 30, 375,
         'anthropic_published',
         'Anthropic published rates 2026-10-10. Callbell internal rates differ.')
    `
    console.log("  ✓ Seeded Sonnet 4.6 rates")
  } else {
    console.log("  (Sonnet 4.6 rates already seeded)")
  }

  if (!seeded.has("claude-haiku-4-5-20251001")) {
    await sql`
      INSERT INTO ai_pricing_tiers
        (provider, model, display_name,
         input_millicents_per_token, output_millicents_per_token,
         cache_read_millicents_per_token, cache_write_millicents_per_token,
         source, note)
      VALUES
        ('anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5',
         80, 400, 8, 100,
         'anthropic_published',
         'Anthropic published rates 2026-10-10.')
    `
    console.log("  ✓ Seeded Haiku 4.5 rates")
  } else {
    console.log("  (Haiku 4.5 rates already seeded)")
  }

  // ── Phase 09: extend ai_usage_records ─────────────────────────────────────
  console.log("Extending ai_usage_records...")
  await sql`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS cache_read_tokens  INTEGER NOT NULL DEFAULT 0`
  await sql`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS cache_write_tokens INTEGER NOT NULL DEFAULT 0`
  await sql`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS input_cost_millicents  BIGINT`
  await sql`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS output_cost_millicents BIGINT`
  await sql`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS cache_read_cost_millicents  BIGINT`
  await sql`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS cache_write_cost_millicents BIGINT`
  await sql`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS total_cost_millicents BIGINT`
  await sql`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS pricing_tier_id UUID REFERENCES ai_pricing_tiers(id) ON DELETE SET NULL`
  await sql`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN NOT NULL DEFAULT FALSE`
  await sql`ALTER TABLE ai_usage_records ADD COLUMN IF NOT EXISTS call_type  TEXT    NOT NULL DEFAULT 'inference'`
  await sql`
    CREATE INDEX IF NOT EXISTS ai_usage_records_analytics_idx
      ON ai_usage_records (org_id, created_at DESC, is_sandbox)
  `
  console.log("  ✓ ai_usage_records extended (10 columns + index)")

  // ── Phase 09: ai_budget_limits ────────────────────────────────────────────
  console.log("Creating ai_budget_limits...")
  await sql`
    CREATE TABLE IF NOT EXISTS ai_budget_limits (
      id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id                          UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
      daily_limit_millicents          BIGINT,
      monthly_limit_millicents        BIGINT,
      per_conversation_limit_millicents BIGINT,
      alert_threshold_pct             INTEGER NOT NULL DEFAULT 80,
      pause_on_exhaust                BOOLEAN NOT NULL DEFAULT TRUE,
      created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  // ── Phase 09: ai_budget_reservations ──────────────────────────────────────
  console.log("Creating ai_budget_reservations...")
  await sql`
    CREATE TABLE IF NOT EXISTS ai_budget_reservations (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      queue_item_id      UUID NOT NULL UNIQUE REFERENCES ai_message_queue(id) ON DELETE CASCADE,
      episode_id         UUID REFERENCES ai_episodes(id) ON DELETE SET NULL,
      reserved_millicents BIGINT NOT NULL,
      status             TEXT NOT NULL DEFAULT 'reserved',
      released_reason    TEXT,
      reserved_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      settled_at         TIMESTAMPTZ,
      usage_record_id    UUID REFERENCES ai_usage_records(id) ON DELETE SET NULL
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS ai_budget_reservations_org_status_idx
      ON ai_budget_reservations (org_id, status)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS ai_budget_reservations_orphan_idx
      ON ai_budget_reservations (reserved_at)
      WHERE status = 'reserved'
  `
  console.log("  ✓ ai_budget_reservations ready")

  // ── Analytics indexes on ai_episodes ──────────────────────────────────────
  console.log("Creating analytics indexes on ai_episodes...")
  await sql`CREATE INDEX IF NOT EXISTS ai_episodes_org_started_idx  ON ai_episodes (org_id, started_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS ai_episodes_org_campaign_idx  ON ai_episodes (org_id, campaign_id)`
  await sql`CREATE INDEX IF NOT EXISTS ai_episodes_exit_reason_idx   ON ai_episodes (org_id, exit_reason) WHERE status = 'ended'`
  console.log("  ✓ indexes ready")

  // ── Verify ─────────────────────────────────────────────────────────────────
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `
  const names = tables.map((r: any) => r.table_name)
  const required = ["ai_pricing_tiers", "ai_budget_limits", "ai_budget_reservations"]
  for (const t of required) {
    if (!names.includes(t)) throw new Error(`Table ${t} not found after migration!`)
  }

  const usageCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'ai_usage_records' ORDER BY ordinal_position
  `
  const colNames = usageCols.map((r: any) => r.column_name)
  const requiredCols = ["cache_read_tokens", "total_cost_millicents", "is_sandbox", "call_type"]
  for (const c of requiredCols) {
    if (!colNames.includes(c)) throw new Error(`Column ai_usage_records.${c} not found!`)
  }

  console.log(`\n✅ Phase 09 migration complete. Total tables: ${names.length}`)
  console.log(`   ai_usage_records columns: ${colNames.length}`)
}

main().catch((err) => { console.error(err); process.exit(1) })

import { config } from "dotenv"
config({ path: ".env.local" })

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  console.log("Applying ad_research migration...")

  await sql`
    CREATE TABLE IF NOT EXISTS ad_research_collections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log("✓ ad_research_collections table created")

  await sql`
    CREATE TABLE IF NOT EXISTS ad_research_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id TEXT NOT NULL,
      collection_id UUID REFERENCES ad_research_collections(id) ON DELETE SET NULL,
      platform TEXT NOT NULL,
      external_id TEXT,
      advertiser_name TEXT NOT NULL,
      advertiser_page_id TEXT,
      ad_title TEXT,
      ad_body TEXT,
      media_type TEXT NOT NULL DEFAULT 'unknown',
      media_urls TEXT[] NOT NULL DEFAULT '{}',
      thumbnail_url TEXT,
      cta_text TEXT,
      landing_page_url TEXT,
      search_country TEXT,
      impressions_lower_bound BIGINT,
      impressions_upper_bound BIGINT,
      likes_count BIGINT,
      comments_count BIGINT,
      shares_count BIGINT,
      ad_delivery_start_time TIMESTAMPTZ,
      ad_delivery_stop_time TIMESTAMPTZ,
      tags TEXT[] NOT NULL DEFAULT '{}',
      notes TEXT,
      raw_data JSONB NOT NULL DEFAULT '{}',
      saved_by TEXT,
      saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log("✓ ad_research_items table created")

  await sql`
    CREATE INDEX IF NOT EXISTS ad_research_items_org_idx
      ON ad_research_items(org_id)
  `

  await sql`
    CREATE INDEX IF NOT EXISTS ad_research_items_platform_idx
      ON ad_research_items(org_id, platform)
  `
  console.log("✓ indexes created")

  console.log("Migration complete.")
}

main().catch((err) => { console.error(err); process.exit(1) })

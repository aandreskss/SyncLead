import { config } from "dotenv"
config({ path: ".env.local" })

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  console.log("Creating meta_lead_ad_sources table...")

  await sql`
    CREATE TABLE IF NOT EXISTS meta_lead_ad_sources (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      page_id     TEXT NOT NULL,
      form_id     TEXT,
      page_access_token_enc TEXT,
      key_version INTEGER NOT NULL DEFAULT 1,
      active      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS meta_lead_ad_sources_org_idx      ON meta_lead_ad_sources(org_id)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS meta_lead_ad_sources_campaign_idx ON meta_lead_ad_sources(campaign_id)
  `
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS meta_lead_ad_sources_page_form_idx
      ON meta_lead_ad_sources(page_id, form_id)
  `

  console.log("✓ meta_lead_ad_sources table ready")
}

main().catch((err) => { console.error(err); process.exit(1) })

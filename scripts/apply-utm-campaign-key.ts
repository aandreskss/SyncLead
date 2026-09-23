import { config } from "dotenv"
config({ path: ".env.local" })

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  console.log("Applying utm_campaign_key migration...")

  await sql`
    ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS utm_campaign_key TEXT
  `
  console.log("✓ utm_campaign_key column added")

  await sql`
    CREATE INDEX IF NOT EXISTS campaigns_utm_campaign_key_idx
      ON campaigns(client_id, utm_campaign_key)
      WHERE utm_campaign_key IS NOT NULL
  `
  console.log("✓ index on (client_id, utm_campaign_key) created")

  console.log("Migration complete.")
}

main().catch((err) => { console.error(err); process.exit(1) })

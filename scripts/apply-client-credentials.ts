import { config } from "dotenv"
config({ path: ".env.local" })

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  console.log("Applying client-level credentials migration...")

  await sql`
    ALTER TABLE ingestion_credentials
      ALTER COLUMN campaign_id DROP NOT NULL
  `
  console.log("✓ campaign_id is now nullable")

  await sql`
    ALTER TABLE ingestion_credentials
      ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE
  `
  console.log("✓ client_id column added")

  await sql`
    CREATE INDEX IF NOT EXISTS ingestion_cred_client_id_idx
      ON ingestion_credentials(client_id)
  `
  console.log("✓ index on client_id created")

  console.log("Migration complete.")
}

main().catch((err) => { console.error(err); process.exit(1) })

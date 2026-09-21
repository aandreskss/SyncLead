/**
 * Applies the ingest_errors table to Neon.
 * Run: npx tsx scripts/apply-ingest-errors-table.ts
 */
import { config } from "dotenv"
config({ path: ".env.local" })

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  console.log("Applying ingest_errors table…")

  await sql`
    CREATE TABLE IF NOT EXISTS ingest_errors (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
      client_id   uuid REFERENCES clients(id) ON DELETE SET NULL,
      error_type  text NOT NULL,
      error_detail text,
      source      text NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT now()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS ingest_errors_org_occurred_idx
      ON ingest_errors(org_id, occurred_at DESC)
  `

  await sql`
    CREATE INDEX IF NOT EXISTS ingest_errors_client_idx
      ON ingest_errors(client_id)
  `

  console.log("Done ✓")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

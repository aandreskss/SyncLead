import { config } from "dotenv"
config({ path: ".env.local" })

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  console.log("Applying Meta features migration...")

  // 1. Add send_behavior_capi column to meta_connections
  await sql`
    ALTER TABLE meta_connections
      ADD COLUMN IF NOT EXISTS send_behavior_capi BOOLEAN NOT NULL DEFAULT FALSE
  `
  console.log("✓ send_behavior_capi column ready")

  // 2. Create meta_custom_audiences table
  await sql`
    CREATE TABLE IF NOT EXISTS meta_custom_audiences (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      meta_connection_id  UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
      audience_type       TEXT NOT NULL,
      meta_audience_id    TEXT,
      name                TEXT NOT NULL,
      member_count        INTEGER NOT NULL DEFAULT 0,
      sync_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
      last_synced_at      TIMESTAMPTZ,
      last_error          TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS meta_custom_audiences_org_idx
      ON meta_custom_audiences(org_id)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS meta_custom_audiences_client_idx
      ON meta_custom_audiences(client_id)
  `
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS meta_custom_audiences_conn_type_idx
      ON meta_custom_audiences(meta_connection_id, audience_type)
  `

  console.log("✓ meta_custom_audiences table ready")
  console.log("Migration complete.")
}

main().catch((err) => { console.error(err); process.exit(1) })

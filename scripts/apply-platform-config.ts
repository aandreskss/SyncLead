import { config } from "dotenv"
config({ path: ".env.local" })

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS platform_config (
      key         TEXT PRIMARY KEY,
      value       JSONB NOT NULL DEFAULT 'null'::jsonb,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    INSERT INTO platform_config (key, value)
    VALUES ('googleLoginEnabled', 'false'::jsonb)
    ON CONFLICT (key) DO NOTHING
  `
  console.log("✓ platform_config table ready (googleLoginEnabled = false)")
}

main().catch((e) => { console.error(e); process.exit(1) })

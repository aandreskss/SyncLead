import { config } from "dotenv"
config({ path: ".env.local" })

import { Pool } from "@neondatabase/serverless"

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })

async function main() {
  console.log("─── Adding waba_id_hint to wa_oauth_states ─────────────────────")
  await pool.query(`ALTER TABLE wa_oauth_states ADD COLUMN IF NOT EXISTS waba_id_hint TEXT`)
  console.log("  ✓ waba_id_hint column added")

  const res = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'wa_oauth_states' AND column_name = 'waba_id_hint'"
  )
  if (res.rows.length === 0) throw new Error("Column not found after migration!")

  console.log("✅ Migration complete")
}

main().catch((err) => { console.error(err); process.exit(1) })

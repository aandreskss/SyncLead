import { config } from "dotenv"
config({ path: ".env.local" })

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false`
  await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS features jsonb`
  console.log("✓ organizations.suspended + organizations.features added")
}

main().catch((e) => { console.error(e); process.exit(1) })

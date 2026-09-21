import { config } from "dotenv"
config({ path: ".env.local" })

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS monthly_report_email boolean NOT NULL DEFAULT false`
  console.log("✓ organizations.monthly_report_email added (or already existed)")
}

main().catch((e) => { console.error(e); process.exit(1) })

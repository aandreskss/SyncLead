import { config } from "dotenv"
config({ path: ".env.local" })

import { Pool } from "@neondatabase/serverless"

const pool = new Pool({ connectionString: process.env.DATABASE_URL! })

async function main() {
  console.log("─── Fixing phone number status values ─────────────────────────────")

  // Normalize any Meta uppercase statuses to our internal lowercase values
  const result = await pool.query(`
    UPDATE wa_phone_numbers
    SET status = CASE
      WHEN UPPER(status) = 'CONNECTED' THEN 'active'
      WHEN UPPER(status) = 'ACTIVE' THEN 'active'
      WHEN UPPER(status) = 'DISCONNECTED' THEN 'active'
      WHEN UPPER(status) = 'PENDING' THEN 'pending'
      WHEN UPPER(status) = 'PENDING_DELETION' THEN 'pending'
      ELSE status
    END
    WHERE status != LOWER(status)
       OR status IN ('CONNECTED', 'DISCONNECTED', 'ACTIVE', 'PENDING', 'PENDING_DELETION')
    RETURNING phone_number_id, status
  `)

  if (result.rows.length === 0) {
    console.log("  ✓ No phone numbers needed normalization")
  } else {
    for (const row of result.rows) {
      console.log(`  ✓ phone_number_id=${row.phone_number_id} → status=${row.status}`)
    }
  }

  // Show current state
  const current = await pool.query(`
    SELECT phone_number_id, display_phone_number, status
    FROM wa_phone_numbers
    ORDER BY created_at DESC
    LIMIT 10
  `)
  console.log("\n  Current phone numbers:")
  for (const row of current.rows) {
    console.log(`    ${row.display_phone_number} (${row.phone_number_id}) → ${row.status}`)
  }

  console.log("\n✅ Fix complete")
}

main().catch((err) => { console.error(err); process.exit(1) })

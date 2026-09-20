/**
 * Preflight check — run before every deploy and daily in CI.
 * Exits with code 0 if all required checks pass, code 1 on any failure.
 *
 * Usage:
 *   npx tsx scripts/preflight.ts              # check env only
 *   npx tsx scripts/preflight.ts --check-db   # also ping DB
 *   npx tsx scripts/preflight.ts --check-migrations # also verify migrations applied
 */

import dotenv from "dotenv"
import path from "path"

// Load .env.local for local runs; in Vercel env vars are already in process.env
dotenv.config({ path: path.join(process.cwd(), ".env.local") })

const args = process.argv.slice(2)
const checkDb = args.includes("--check-db")
const checkMigrations = args.includes("--check-migrations")

// ─── Terminal helpers ─────────────────────────────────────────────────────────

const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const red   = (s: string) => `\x1b[31m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const bold  = (s: string) => `\x1b[1m${s}\x1b[0m`

function pass(label: string, detail?: string) {
  console.log(`  ${green("✓")} ${label}${detail ? `  ${detail}` : ""}`)
}
function fail(label: string, detail?: string) {
  console.log(`  ${red("✗")} ${bold(label)}${detail ? `\n    ${red(detail)}` : ""}`)
}
function warn(label: string, detail?: string) {
  console.log(`  ${yellow("⚠")} ${label}${detail ? `  (${detail})` : ""}`)
}
function section(title: string) {
  console.log(`\n${bold(title)}`)
}

// ─── Check definitions ────────────────────────────────────────────────────────

interface Check {
  label: string
  required: boolean
  run: () => Promise<{ ok: boolean; detail?: string }>
}

const checks: Check[] = [
  // ── Required secrets ──────────────────────────────────────────────────────
  {
    label: "AUTH_SECRET is set",
    required: true,
    run: async () => {
      const v = process.env.AUTH_SECRET
      if (!v) return { ok: false, detail: "Generate with: openssl rand -base64 32" }
      if (v.length < 32) return { ok: false, detail: "Must be ≥ 32 chars" }
      return { ok: true }
    },
  },
  {
    label: "DATABASE_URL is set",
    required: true,
    run: async () => {
      const v = process.env.DATABASE_URL
      if (!v) return { ok: false, detail: "Neon Postgres connection string required" }
      if (!v.startsWith("postgres")) return { ok: false, detail: "Must start with postgres://" }
      return { ok: true, detail: v.replace(/:[^:@]+@/, ":***@") }
    },
  },
  {
    label: "ENCRYPTION_KEY is 64 hex chars (32 bytes)",
    required: true,
    run: async () => {
      const v = process.env.ENCRYPTION_KEY
      if (!v) return { ok: false, detail: "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"" }
      if (!/^[0-9a-fA-F]{64}$/.test(v)) return { ok: false, detail: `Got ${v.length} chars, need exactly 64 hex chars` }
      return { ok: true }
    },
  },
  {
    label: "CRON_SECRET is set",
    required: true,
    run: async () => {
      const v = process.env.CRON_SECRET
      if (!v) return { ok: false, detail: "Generate with: openssl rand -hex 32" }
      if (v.length < 32) return { ok: false, detail: "Must be ≥ 32 chars" }
      return { ok: true }
    },
  },
  {
    label: "NEXT_PUBLIC_APP_URL is set",
    required: true,
    run: async () => {
      const v = process.env.NEXT_PUBLIC_APP_URL
      if (!v) return { ok: false, detail: "e.g., https://app.synclead.io" }
      if (v.includes("localhost") && process.env.NODE_ENV === "production") {
        return { ok: false, detail: "localhost URL in production environment" }
      }
      return { ok: true, detail: v }
    },
  },
  // ── ENCRYPTION_KEY_VERSION consistency ────────────────────────────────────
  {
    label: "ENCRYPTION_KEY_VERSION consistency",
    required: true,
    run: async () => {
      const version = parseInt(process.env.ENCRYPTION_KEY_VERSION ?? "1", 10)
      if (isNaN(version) || version < 1) return { ok: false, detail: "Must be a positive integer" }
      if (version > 1) {
        const versionKey = process.env[`ENCRYPTION_KEY_${version}`]
        if (!versionKey) return { ok: false, detail: `ENCRYPTION_KEY_VERSION=${version} but ENCRYPTION_KEY_${version} is not set` }
        if (!/^[0-9a-fA-F]{64}$/.test(versionKey)) return { ok: false, detail: `ENCRYPTION_KEY_${version} must be 64 hex chars` }
      }
      return { ok: true, detail: `version=${version}` }
    },
  },
  // ── Meta settings ─────────────────────────────────────────────────────────
  {
    label: "META_CONNECTION_MODE is valid",
    required: true,
    run: async () => {
      const mode = process.env.META_CONNECTION_MODE ?? "internal_manual"
      const validModes = ["internal_manual", "external_oauth"]
      if (!validModes.includes(mode)) return { ok: false, detail: `Got "${mode}", must be one of: ${validModes.join(", ")}` }
      if (mode === "external_oauth" && process.env.ENABLE_EXTERNAL_META_OAUTH !== "true") {
        return { ok: false, detail: "mode=external_oauth but ENABLE_EXTERNAL_META_OAUTH!=true" }
      }
      return { ok: true, detail: `mode=${mode}` }
    },
  },
  {
    label: "ENABLE_EXTERNAL_META_OAUTH is false unless Meta App Review complete",
    required: false,
    run: async () => {
      const v = process.env.ENABLE_EXTERNAL_META_OAUTH ?? "false"
      if (v === "true") return { ok: true, detail: yellow("enabled — ensure App Review is complete") }
      return { ok: true, detail: "disabled (safe default)" }
    },
  },
  // ── Optional but important ────────────────────────────────────────────────
  {
    label: "UPSTASH_REDIS_REST_URL (rate limiting)",
    required: false,
    run: async () => {
      if (!process.env.UPSTASH_REDIS_REST_URL) return { ok: true, detail: "not set — rate limiting degraded but functional" }
      if (!process.env.UPSTASH_REDIS_REST_TOKEN) return { ok: false, detail: "URL set but TOKEN missing" }
      return { ok: true }
    },
  },
  {
    label: "RESEND_API_KEY (transactional email)",
    required: false,
    run: async () => {
      if (!process.env.RESEND_API_KEY) return { ok: true, detail: "not set — email features disabled" }
      if (!process.env.RESEND_FROM_EMAIL) return { ok: false, detail: "API key set but RESEND_FROM_EMAIL missing" }
      return { ok: true }
    },
  },
  // ── Production safety ─────────────────────────────────────────────────────
  {
    label: "META_TEST_EVENT_CODE not set in production",
    required: false,
    run: async () => {
      const isVercelProd = process.env.VERCEL_ENV === "production"
      const isNodeProd = process.env.NODE_ENV === "production"
      if ((isVercelProd || isNodeProd) && process.env.META_TEST_EVENT_CODE) {
        return { ok: false, detail: "META_TEST_EVENT_CODE must NOT be set in production — removes it or use preview env only" }
      }
      return { ok: true }
    },
  },
]

// ─── DB Check ─────────────────────────────────────────────────────────────────

async function runDbCheck(): Promise<boolean> {
  section("Database connectivity")
  try {
    // Dynamic import so this file can be loaded without DB connection
    const { db } = await import("../src/lib/db")
    const { sql } = await import("drizzle-orm")
    const start = Date.now()
    await db.execute(sql`SELECT 1`)
    pass("DB connection", `${Date.now() - start}ms`)
    return true
  } catch (e) {
    fail("DB connection", e instanceof Error ? e.message.slice(0, 100) : "unknown error")
    return false
  }
}

// ─── Migrations Check ─────────────────────────────────────────────────────────

async function runMigrationsCheck(): Promise<boolean> {
  section("Migration status")
  try {
    const { db } = await import("../src/lib/db")
    const { sql } = await import("drizzle-orm")

    // Check that the most recent migration tables/columns exist
    const checks: Array<{ label: string; query: string }> = [
      { label: "cron_runs table exists", query: "SELECT 1 FROM cron_runs LIMIT 1" },
      { label: "leads.consent_given column exists", query: "SELECT consent_given FROM leads LIMIT 1" },
      { label: "leads.erased_at column exists", query: "SELECT erased_at FROM leads LIMIT 1" },
    ]

    let allOk = true
    for (const check of checks) {
      try {
        await db.execute(sql.raw(check.query))
        pass(check.label)
      } catch {
        fail(check.label, "Migration not applied — run: npx drizzle-kit migrate")
        allOk = false
      }
    }
    return allOk
  } catch (e) {
    fail("Migration check failed", e instanceof Error ? e.message.slice(0, 100) : "unknown error")
    return false
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(bold("\n━━━ SyncLead Preflight Check ━━━\n"))

  section("Environment variables")
  let requiredFailed = 0
  let warnings = 0

  for (const check of checks) {
    const result = await check.run()
    if (result.ok) {
      pass(check.label, result.detail)
    } else if (check.required) {
      fail(check.label, result.detail)
      requiredFailed++
    } else {
      warn(check.label, result.detail)
      warnings++
    }
  }

  let dbOk = true
  let migrationsOk = true

  if (checkDb) {
    dbOk = await runDbCheck()
  }

  if (checkMigrations) {
    migrationsOk = await runMigrationsCheck()
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${bold("━━━ Summary ━━━")}\n`)

  const totalFailed = requiredFailed + (dbOk ? 0 : 1) + (migrationsOk ? 0 : 1)

  if (totalFailed === 0) {
    console.log(green(`  ✓ All required checks passed${warnings > 0 ? ` (${warnings} warnings)` : ""}`))
    console.log(green(`  ✓ Safe to deploy\n`))
    process.exit(0)
  } else {
    console.log(red(`  ✗ ${totalFailed} required check(s) failed — DO NOT DEPLOY\n`))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(red("\n  Fatal error in preflight:"), e)
  process.exit(1)
})

/**
 * Bundle safety tests — verifies that secrets and server-only code don't
 * leak into the client bundle.
 *
 * These tests are intentionally conservative: they test static properties
 * (function signatures, known-bad patterns) rather than actually running
 * the Next.js build, which is done in CI.
 */
import { describe, it, expect } from "vitest"
import { looksLikeSecret } from "@/lib/redact"
import * as fs from "fs"
import * as path from "path"

// ─── NEXT_PUBLIC_ env vars must not hold secret values ────────────────────────

describe("NEXT_PUBLIC env var safety", () => {
  const knownSafePublicVars = [
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  ]

  it("NEXT_PUBLIC_APP_URL is a URL, not a secret", () => {
    const v = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    expect(looksLikeSecret(v)).toBe(false)
  })

  it("known NEXT_PUBLIC_ vars are not empty secret strings in test env", () => {
    // In CI / test env these are either unset or set to safe placeholder values.
    for (const key of knownSafePublicVars) {
      const v = process.env[key]
      if (v) {
        expect(looksLikeSecret(v), `${key} looks like a secret`).toBe(false)
      }
    }
  })
})

// ─── Server-only module guard — crypto.ts must have server-only import ────────

describe("server-only guard on sensitive modules", () => {
  const root = path.resolve(__dirname, "..")

  function firstFewLines(relPath: string): string {
    const fullPath = path.join(root, relPath)
    const content = fs.readFileSync(fullPath, "utf8")
    return content.split("\n").slice(0, 5).join("\n")
  }

  it("crypto.ts starts with server-only import", () => {
    const lines = firstFewLines("lib/crypto.ts")
    expect(lines).toContain("server-only")
  })

  it("meta-capi.ts starts with server-only import", () => {
    const lines = firstFewLines("lib/meta-capi.ts")
    expect(lines).toContain("server-only")
  })

  it("audit.ts starts with server-only import", () => {
    const lines = firstFewLines("lib/audit.ts")
    expect(lines).toContain("server-only")
  })

  it("meta-outbox/worker.ts starts with server-only import", () => {
    const lines = firstFewLines("lib/meta-outbox/worker.ts")
    expect(lines).toContain("server-only")
  })
})

// ─── Client components must not import server-only modules directly ───────────

describe("client component isolation", () => {
  const root = path.resolve(__dirname, "..")

  function readFile(relPath: string): string {
    return fs.readFileSync(path.join(root, relPath), "utf8")
  }

  function clientComponentPaths(): string[] {
    // Collect all "_components/**/*.tsx" files that have "use client"
    const componentDirs = [
      "app/dashboard/_components",
      "app/dashboard/clients/_components",
      "app/dashboard/campaigns/_components",
      "app/dashboard/funnels/_components",
      "app/dashboard/performance/_components",
      "app/dashboard/import/_components",
    ]
    const results: string[] = []
    for (const dir of componentDirs) {
      const fullDir = path.join(root, dir)
      if (!fs.existsSync(fullDir)) continue
      const files = fs.readdirSync(fullDir).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
      for (const file of files) {
        const relPath = `${dir}/${file}`
        const content = readFile(relPath)
        if (content.startsWith('"use client"') || content.startsWith("'use client'")) {
          results.push(relPath)
        }
      }
    }
    return results
  }

  const forbiddenImports = ["@/lib/crypto", "@/lib/meta-capi", "@/lib/audit"]

  it("client components do not import server-only crypto or audit modules", () => {
    const components = clientComponentPaths()
    const violations: string[] = []
    for (const comp of components) {
      const content = readFile(comp)
      for (const forbidden of forbiddenImports) {
        if (content.includes(forbidden)) {
          violations.push(`${comp} imports ${forbidden}`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})

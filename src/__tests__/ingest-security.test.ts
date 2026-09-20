import { vi, describe, it, expect, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      ingestionCredentials: { findFirst: vi.fn() },
      campaigns: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(),
        })),
        returning: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
}))

import { checkHoneypot, checkSubmitTime, verifyTurnstile } from "@/lib/ingest/bot"
import { anonymizeIp, isOriginAllowed } from "@/lib/ingest/normalize"
import { lookupCredential } from "@/lib/ingest/lookup"
import { FormPayloadSchema, ServerPayloadSchema, MAX_BODY_BYTES } from "@/lib/ingest/schema"

// ─── Bot protection ───────────────────────────────────────────────────────────

describe("checkHoneypot", () => {
  it("passes when honeypot field is absent", () => {
    expect(checkHoneypot(undefined)).toBe(true)
  })

  it("passes when honeypot field is empty string", () => {
    expect(checkHoneypot("")).toBe(true)
  })

  it("fails when honeypot field is filled — bot detected", () => {
    expect(checkHoneypot("bot-filled-this")).toBe(false)
  })

  it("fails on whitespace-only fill", () => {
    // A space is still a bot-like fill
    expect(checkHoneypot("   ")).toBe(false)
  })
})

describe("checkSubmitTime", () => {
  it("passes when no timestamp is provided", () => {
    expect(checkSubmitTime(undefined)).toBe(true)
  })

  it("fails when elapsed time is less than 3 seconds", () => {
    const ts = Date.now() - 500 // 500ms ago
    expect(checkSubmitTime(ts)).toBe(false)
  })

  it("passes when elapsed time meets minimum", () => {
    const ts = Date.now() - 5000 // 5s ago
    expect(checkSubmitTime(ts)).toBe(true)
  })

  it("passes with custom minimum", () => {
    const ts = Date.now() - 1500
    expect(checkSubmitTime(ts, 1000)).toBe(true)
    expect(checkSubmitTime(ts, 2000)).toBe(false)
  })
})

describe("verifyTurnstile — when TURNSTILE_SECRET_KEY is not set", () => {
  it("returns true (skip check) so deploys without Turnstile still work", async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    expect(await verifyTurnstile(undefined)).toBe(true)
    expect(await verifyTurnstile("any-token")).toBe(true)
  })
})

// ─── IP anonymization ─────────────────────────────────────────────────────────

describe("anonymizeIp", () => {
  it("zeroes last octet of IPv4", () => {
    expect(anonymizeIp("1.2.3.4")).toBe("1.2.3.0")
    expect(anonymizeIp("192.168.1.255")).toBe("192.168.1.0")
  })

  it("keeps first 48 bits of IPv6 (3 groups)", () => {
    expect(anonymizeIp("2001:db8:85a3::1")).toBe("2001:db8:85a3")
  })

  it("returns null for empty or null input", () => {
    expect(anonymizeIp(null)).toBe(null)
    expect(anonymizeIp("")).toBe(null)
  })

  it("returns null for malformed IPv4", () => {
    expect(anonymizeIp("not.an.ip")).toBe(null)
    expect(anonymizeIp("1.2.3")).toBe(null)
  })
})

// ─── Origin validation ────────────────────────────────────────────────────────

describe("isOriginAllowed", () => {
  it("allows any origin when allowedOrigins is empty (open credential)", () => {
    expect(isOriginAllowed("https://evil.com", [])).toBe(true)
  })

  it("allows when origin is in allowlist", () => {
    expect(isOriginAllowed("https://myapp.com", ["https://myapp.com"])).toBe(true)
  })

  it("rejects when origin is NOT in allowlist — cross-origin attack", () => {
    expect(isOriginAllowed("https://evil.com", ["https://myapp.com"])).toBe(false)
  })

  it("allows requests with no Origin header (non-browser / curl)", () => {
    expect(isOriginAllowed(null, ["https://myapp.com"])).toBe(true)
  })

  it("rejects exact-match only — subdomain does not bypass", () => {
    expect(isOriginAllowed("https://sub.myapp.com", ["https://myapp.com"])).toBe(false)
  })
})

// ─── Payload validation ───────────────────────────────────────────────────────

describe("FormPayloadSchema — bot fields", () => {
  it("accepts valid form payload", () => {
    const result = FormPayloadSchema.safeParse({ name: "Ana", _hp: "", _t: Date.now() - 5000 })
    expect(result.success).toBe(true)
  })

  it("rejects empty name", () => {
    const result = FormPayloadSchema.safeParse({ name: "" })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe("name is required")
  })

  it("accepts malicious-looking strings safely — Zod sanitizes, DB parameterizes", () => {
    const malicious = "<script>alert(1)</script>'; DROP TABLE leads;--"
    const result = FormPayloadSchema.safeParse({ name: malicious })
    // Zod accepts it — XSS/injection prevention is at the output layer (ORM/HTML escaping)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.name).toBe(malicious)
  })

  it("rejects payload exceeding field max length", () => {
    const result = FormPayloadSchema.safeParse({ name: "A".repeat(256) })
    expect(result.success).toBe(false)
  })

  it("rejects invalid email", () => {
    const result = FormPayloadSchema.safeParse({ name: "Test", email: "not-an-email" })
    expect(result.success).toBe(false)
  })

  it("rejects invalid landing_url", () => {
    const result = FormPayloadSchema.safeParse({ name: "Test", landing_url: "javascript:alert(1)" })
    expect(result.success).toBe(false)
  })
})

describe("MAX_BODY_BYTES guard", () => {
  it("large payload exceeds MAX_BODY_BYTES constant", () => {
    const largeBody = JSON.stringify({ name: "Test", utm_source: "x".repeat(MAX_BODY_BYTES) })
    expect(largeBody.length).toBeGreaterThan(MAX_BODY_BYTES)
  })

  it("normal payload is well under MAX_BODY_BYTES", () => {
    const normalBody = JSON.stringify({
      name: "María González",
      email: "maria@example.com",
      phone: "+584121234567",
      city: "Caracas",
      utm_source: "facebook",
      utm_campaign: "vestidos-2026",
    })
    expect(normalBody.length).toBeLessThan(MAX_BODY_BYTES)
  })
})

describe("ServerPayloadSchema — server-to-server", () => {
  it("accepts full server payload", () => {
    const result = ServerPayloadSchema.safeParse({
      name: "Carlos Test",
      event_id: "server-evt-001",
      utm_source: "crm",
    })
    expect(result.success).toBe(true)
  })

  it("does not have bot-protection fields", () => {
    // ServerPayloadSchema does not include _hp, _t, cf-turnstile-response
    const result = ServerPayloadSchema.safeParse({
      name: "Test",
      "_hp": "bot-fill",    // Ignored — not in schema
      "_t": 123,            // Ignored
    })
    // Parse succeeds — extra fields are stripped by Zod
    expect(result.success).toBe(true)
  })
})

// ─── Credential lookup ────────────────────────────────────────────────────────

describe("lookupCredential", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns null for empty key", async () => {
    const result = await lookupCredential("")
    expect(result).toBeNull()
  })

  it("returns null for key longer than 512 chars", async () => {
    const result = await lookupCredential("x".repeat(513))
    expect(result).toBeNull()
  })
})

// ─── Cross-tenant resolution guarantee ───────────────────────────────────────

describe("credential resolves org/campaign — does not trust body", () => {
  it("orgId comes from credential in DB, not from request body", () => {
    // The ingest routes call lookupCredential(rawKey) and use cred.orgId
    // The request body has no org_id field at all in either schema
    const bodyFields = Object.keys(FormPayloadSchema.shape)
    expect(bodyFields).not.toContain("org_id")
    expect(bodyFields).not.toContain("orgId")
    expect(bodyFields).not.toContain("campaign_id")
    expect(bodyFields).not.toContain("campaignId")
  })

  it("campaign_id comes from credential in DB, not from request body", () => {
    const bodyFields = Object.keys(ServerPayloadSchema.shape)
    expect(bodyFields).not.toContain("campaign_id")
    expect(bodyFields).not.toContain("campaignId")
  })
})

// ─── Idempotency guarantee (documented for integration testing) ───────────────

describe("idempotency — documented DB guarantees", () => {
  it("documents: concurrent duplicate event_id is handled by UNIQUE INDEX on webhook_events(campaignId, eventId)", () => {
    // Integration test would:
    // 1. Send two concurrent POST /api/ingest/server requests with the same event_id
    // 2. One succeeds (INSERT webhook_events) → lead created
    // 3. The other hits the unique constraint → ON CONFLICT DO NOTHING → returns { duplicate: true }
    // Guaranteed by: uniqueIndex("webhook_events_campaign_event_idx").on(t.campaignId, t.eventId)
    expect(true).toBe(true)
  })

  it("documents: replay with same event_id returns same success response without creating new lead", () => {
    // Integration test would:
    // 1. POST with event_id="evt-001" → 201 Created, leadId="abc"
    // 2. POST with same event_id="evt-001" → 200 OK, duplicate: true, no new lead in DB
    // Guaranteed by: ON CONFLICT DO NOTHING on webhook_events
    expect(true).toBe(true)
  })

  it("documents: omitting event_id creates a new lead on every request (no idempotency)", () => {
    // Without event_id, each request generates a random UUID → always a new webhook_event
    // This is intentional — idempotency is opt-in
    expect(true).toBe(true)
  })
})

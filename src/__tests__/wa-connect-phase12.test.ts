/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi, describe, it, expect, beforeEach } from "vitest"
import { createHmac } from "crypto"

// ─── Mock server-only (no client/server boundary in tests) ───────────────────
vi.mock("server-only", () => ({}))

// ─── Mock DB ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

// ─── Mock schema ─────────────────────────────────────────────────────────────
vi.mock("@/lib/db/schema", () => ({
  waOauthStates: { id: "id", orgId: "org_id", returnPath: "return_path", expiresAt: "expires_at", consumedAt: "consumed_at", createdAt: "created_at" },
  waBusinessAccounts: { id: "id", wabaId: "waba_id", orgId: "org_id" },
  waPhoneNumbers: { id: "id", phoneNumberId: "phone_number_id", orgId: "org_id", wabaAccountId: "waba_account_id" },
}))

// ─── Mock drizzle-orm ─────────────────────────────────────────────────────────
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val, op: "eq" })),
  and: vi.fn((...args: unknown[]) => ({ args, op: "and" })),
  lt: vi.fn((col: unknown, val: unknown) => ({ col, val, op: "lt" })),
}))

// ─── Mock crypto ─────────────────────────────────────────────────────────────
vi.mock("@/lib/crypto", () => ({
  encryptTokenVersioned: vi.fn(() => ({ ciphertext: "v1:encrypted", keyVersion: 1 })),
  decryptTokenVersioned: vi.fn(() => "decrypted-token"),
}))

// ─── Imports after mocks ──────────────────────────────────────────────────────
import { db } from "@/lib/db"
import {
  createOauthState,
  consumeOauthState,
  storeOrUpdateConnection,
  markWabaDisconnected,
} from "@/domains/meta-wa-connect/repository"
import {
  buildOAuthUrl,
  hasRequiredScopes,
  parseSignedRequest,
} from "@/domains/meta-wa-connect/oauth"
import { unsubscribeWabaFromApp } from "@/domains/meta-wa-connect/webhook-subscription"

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a mock Drizzle insert chain returning given rows */
function mockInsertChain(rows: Record<string, unknown>[]) {
  const returning = vi.fn().mockResolvedValue(rows)
  const values = vi.fn().mockReturnValue({ returning })
  const insert = vi.fn().mockReturnValue({ values })
  vi.mocked(db.insert).mockReturnValue(insert() as any)
  return { insert, values, returning }
}

/** Build a mock Drizzle select chain returning given rows */
function mockSelectChain(rows: Record<string, unknown>[]) {
  const limit = vi.fn().mockResolvedValue(rows)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })
  vi.mocked(db.select).mockReturnValue(select() as any)
  return { select, from, where, limit }
}

/** Build a mock Drizzle update chain */
function mockUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined)
  const set = vi.fn().mockReturnValue({ where })
  const update = vi.fn().mockReturnValue({ set })
  vi.mocked(db.update).mockReturnValue(update() as any)
  return { update, set, where }
}

/** Build a mock Drizzle delete chain */
function mockDeleteChain() {
  const catchFn = vi.fn().mockResolvedValue(undefined)
  const where = vi.fn().mockReturnValue({ catch: catchFn })
  const del = vi.fn().mockReturnValue({ where })
  vi.mocked(db.delete).mockReturnValue(del() as any)
  return { del, where }
}

// ─── Environment setup ───────────────────────────────────────────────────────
beforeEach(() => {
  vi.resetAllMocks()
  process.env.META_WA_APP_ID = "test-app-id"
  process.env.WA_CLOUD_APP_SECRET = "test-secret-12345678901234567890123456"
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com"
  delete process.env.META_WA_CONFIG_ID
  delete process.env.META_WA_REDIRECT_URI
})

// ─── 1. createOauthState ─────────────────────────────────────────────────────
describe("createOauthState", () => {
  it("inserts a state row and returns its id", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "state-uuid-123" }])
    const values = vi.fn().mockReturnValue({ returning })
    vi.mocked(db.insert).mockReturnValue({ values } as any)

    const id = await createOauthState("org-abc", "/dashboard/settings/channels")
    expect(id).toBe("state-uuid-123")
    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-abc", returnPath: "/dashboard/settings/channels" })
    )
  })

  it("uses default returnPath when not provided", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "state-uuid-456" }])
    const values = vi.fn().mockReturnValue({ returning })
    vi.mocked(db.insert).mockReturnValue({ values } as any)

    await createOauthState("org-abc")
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ returnPath: "/dashboard/settings/channels" })
    )
  })

  it("sets expiresAt to ~10 minutes in the future", async () => {
    const before = Date.now()
    const returning = vi.fn().mockResolvedValue([{ id: "state-uuid-789" }])
    const values = vi.fn().mockReturnValue({ returning })
    vi.mocked(db.insert).mockReturnValue({ values } as any)

    await createOauthState("org-abc")
    const after = Date.now()

    const callArgs = values.mock.calls[0][0] as { expiresAt: Date }
    const expiresMs = callArgs.expiresAt.getTime()
    expect(expiresMs).toBeGreaterThanOrEqual(before + 9 * 60 * 1000)
    expect(expiresMs).toBeLessThanOrEqual(after + 10 * 60 * 1000 + 100)
  })
})

// ─── 2. consumeOauthState — first call returns ok ────────────────────────────
describe("consumeOauthState", () => {
  it("returns state data on first call and marks consumed", async () => {
    const state = {
      id: "state-001",
      orgId: "org-tenant-a",
      returnPath: "/dashboard/settings/channels",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min future
      consumedAt: null,
      createdAt: new Date(),
    }

    // First select returns the state row
    const limit1 = vi.fn().mockResolvedValue([state])
    const where1 = vi.fn().mockReturnValue({ limit: limit1 })
    const from1 = vi.fn().mockReturnValue({ where: where1 })
    vi.mocked(db.select).mockReturnValueOnce({ from: from1 } as any)

    // Update marks consumed
    const whereUpd = vi.fn().mockResolvedValue(undefined)
    const setUpd = vi.fn().mockReturnValue({ where: whereUpd })
    vi.mocked(db.update).mockReturnValueOnce({ set: setUpd } as any)

    const result = await consumeOauthState("state-001")
    expect(result).toEqual({ ok: true, orgId: "org-tenant-a", returnPath: "/dashboard/settings/channels" })
    expect(db.update).toHaveBeenCalledTimes(1)
  })

  it("returns consumed on replay (consumedAt already set)", async () => {
    const state = {
      id: "state-001",
      orgId: "org-tenant-a",
      returnPath: "/dashboard",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: new Date(), // already consumed
      createdAt: new Date(),
    }

    const limit = vi.fn().mockResolvedValue([state])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    vi.mocked(db.select).mockReturnValueOnce({ from } as any)

    const result = await consumeOauthState("state-001")
    expect(result).toEqual({ ok: false, reason: "consumed" })
    expect(db.update).not.toHaveBeenCalled()
  })

  it("returns expired for old states", async () => {
    const state = {
      id: "state-001",
      orgId: "org-tenant-a",
      returnPath: "/dashboard",
      expiresAt: new Date(Date.now() - 1000), // 1s in the past
      consumedAt: null,
      createdAt: new Date(),
    }

    const limit = vi.fn().mockResolvedValue([state])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    vi.mocked(db.select).mockReturnValueOnce({ from } as any)

    const result = await consumeOauthState("state-001")
    expect(result).toEqual({ ok: false, reason: "expired" })
    expect(db.update).not.toHaveBeenCalled()
  })

  it("returns not_found for unknown stateId", async () => {
    const limit = vi.fn().mockResolvedValue([]) // empty
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    vi.mocked(db.select).mockReturnValueOnce({ from } as any)

    const result = await consumeOauthState("nonexistent-state")
    expect(result).toEqual({ ok: false, reason: "not_found" })
    expect(db.update).not.toHaveBeenCalled()
  })
})

// ─── 5. parseSignedRequest ────────────────────────────────────────────────────
describe("parseSignedRequest", () => {
  function makeSignedRequest(payload: object): string {
    const secret = process.env.WA_CLOUD_APP_SECRET!
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url")
    const sig = createHmac("sha256", secret).update(payloadBase64).digest("base64url")
    return `${sig}.${payloadBase64}`
  }

  it("correctly verifies HMAC and extracts WABA ID", () => {
    const sr = makeSignedRequest({ waba_id: "waba-123", phone_number_id: "phone-456" })
    const result = parseSignedRequest(sr)
    expect(result).toEqual({ wabaId: "waba-123", phoneNumberId: "phone-456" })
  })

  it("extracts WABA ID without phone_number_id", () => {
    const sr = makeSignedRequest({ waba_id: "waba-789" })
    const result = parseSignedRequest(sr)
    expect(result).toEqual({ wabaId: "waba-789", phoneNumberId: undefined })
  })

  it("rejects tampered payload (changes data after signing)", () => {
    const sr = makeSignedRequest({ waba_id: "waba-original" })
    const [sig, payload] = sr.split(".")
    // Tamper: replace the payload with a different one
    const tamperedPayload = Buffer.from(JSON.stringify({ waba_id: "waba-hacked" })).toString("base64url")
    const tampered = `${sig}.${tamperedPayload}`
    const result = parseSignedRequest(tampered)
    expect(result).toBeNull()
  })

  it("rejects tampered signature", () => {
    const sr = makeSignedRequest({ waba_id: "waba-123" })
    const [, payload] = sr.split(".")
    const fakeSignedRequest = `fakesignature123.${payload}`
    const result = parseSignedRequest(fakeSignedRequest)
    expect(result).toBeNull()
  })

  it("returns null for missing dot separator", () => {
    expect(parseSignedRequest("nodothere")).toBeNull()
  })

  it("returns null if waba_id missing in payload", () => {
    const sr = makeSignedRequest({ phone_number_id: "phone-only" })
    const result = parseSignedRequest(sr)
    expect(result).toBeNull()
  })
})

// ─── 8. hasRequiredScopes ────────────────────────────────────────────────────
describe("hasRequiredScopes", () => {
  it("returns true when all required scopes present", () => {
    expect(hasRequiredScopes([
      "whatsapp_business_management",
      "whatsapp_business_messaging",
      "business_management",
    ])).toBe(true)
  })

  it("returns true with exactly the two required scopes", () => {
    expect(hasRequiredScopes([
      "whatsapp_business_management",
      "whatsapp_business_messaging",
    ])).toBe(true)
  })

  it("returns false when missing whatsapp_business_messaging", () => {
    expect(hasRequiredScopes([
      "whatsapp_business_management",
      "business_management",
    ])).toBe(false)
  })

  it("returns false when missing whatsapp_business_management", () => {
    expect(hasRequiredScopes([
      "whatsapp_business_messaging",
      "business_management",
    ])).toBe(false)
  })

  it("returns false when scopes array is empty", () => {
    expect(hasRequiredScopes([])).toBe(false)
  })

  it("returns false with unrelated scopes", () => {
    expect(hasRequiredScopes(["ads_read", "pages_read_engagement"])).toBe(false)
  })
})

// ─── 11. buildOAuthUrl ───────────────────────────────────────────────────────
describe("buildOAuthUrl", () => {
  it("includes state, scope, client_id, redirect_uri", () => {
    const url = buildOAuthUrl("my-state-id")
    const parsed = new URL(url)

    expect(parsed.hostname).toBe("www.facebook.com")
    expect(parsed.pathname).toBe("/dialog/oauth")
    expect(parsed.searchParams.get("state")).toBe("my-state-id")
    expect(parsed.searchParams.get("client_id")).toBe("test-app-id")
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://app.example.com/api/wa-connect/callback")
    expect(parsed.searchParams.get("scope")).toContain("whatsapp_business_management")
    expect(parsed.searchParams.get("scope")).toContain("whatsapp_business_messaging")
    expect(parsed.searchParams.get("response_type")).toBe("code")
  })

  it("includes config_id when META_WA_CONFIG_ID is set", () => {
    process.env.META_WA_CONFIG_ID = "config-12345"
    const url = buildOAuthUrl("state-xyz")
    const parsed = new URL(url)
    expect(parsed.searchParams.get("config_id")).toBe("config-12345")
    expect(parsed.searchParams.get("override_default_response_type")).toBe("true")
    delete process.env.META_WA_CONFIG_ID
  })

  it("does not include config_id when META_WA_CONFIG_ID is not set", () => {
    delete process.env.META_WA_CONFIG_ID
    const url = buildOAuthUrl("state-abc")
    const parsed = new URL(url)
    expect(parsed.searchParams.get("config_id")).toBeNull()
  })

  it("uses META_WA_REDIRECT_URI when set (overrides auto-derived)", () => {
    process.env.META_WA_REDIRECT_URI = "https://custom.example.com/callback"
    const url = buildOAuthUrl("state-custom")
    const parsed = new URL(url)
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://custom.example.com/callback")
    delete process.env.META_WA_REDIRECT_URI
  })
})

// ─── 13. storeOrUpdateConnection ─────────────────────────────────────────────
describe("storeOrUpdateConnection", () => {
  it("returns number_conflict when phone belongs to different org", async () => {
    // Phone lookup returns a row with different orgId
    const limit1 = vi.fn().mockResolvedValue([{ id: "phone-record-1", orgId: "org-OTHER" }])
    const where1 = vi.fn().mockReturnValue({ limit: limit1 })
    const from1 = vi.fn().mockReturnValue({ where: where1 })
    vi.mocked(db.select).mockReturnValueOnce({ from: from1 } as any)

    const result = await storeOrUpdateConnection({
      orgId: "org-tenant-a",
      wabaId: "waba-1",
      wabaName: "Test WABA",
      accessToken: "token",
      scopes: [],
      connectionMode: "embedded_signup",
      connectionStatus: "active",
      phoneNumbers: [{ phoneNumberId: "phone-001", displayPhoneNumber: "+1234567890" }],
    })

    expect(result).toEqual({ ok: false, reason: "number_conflict", conflictingPhoneId: "phone-001" })
  })

  it("returns ok: true when phone belongs to same org (reconnect)", async () => {
    // Phone lookup: same org
    const limit1 = vi.fn().mockResolvedValue([{ id: "phone-record-1", orgId: "org-tenant-a" }])
    const where1 = vi.fn().mockReturnValue({ limit: limit1 })
    const from1 = vi.fn().mockReturnValue({ where: where1 })
    vi.mocked(db.select).mockReturnValueOnce({ from: from1 } as any)

    // WABA insert/upsert returns the WABA record
    const returning2 = vi.fn().mockResolvedValue([{ id: "waba-record-1" }])
    const onConflictDoUpdate2 = vi.fn().mockReturnValue({ returning: returning2 })
    const values2 = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictDoUpdate2 })
    vi.mocked(db.insert).mockReturnValueOnce({ values: values2 } as any)

    // Phone number insert/upsert
    const catchFn = vi.fn().mockResolvedValue(undefined)
    const onConflictDoUpdate3 = vi.fn().mockReturnValue({ catch: catchFn })
    const values3 = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictDoUpdate3 })
    vi.mocked(db.insert).mockReturnValueOnce({ values: values3 } as any)

    const result = await storeOrUpdateConnection({
      orgId: "org-tenant-a",
      wabaId: "waba-1",
      wabaName: "Test WABA",
      accessToken: "token",
      scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
      connectionMode: "embedded_signup",
      connectionStatus: "active",
      phoneNumbers: [{ phoneNumberId: "phone-001", displayPhoneNumber: "+1234567890" }],
    })

    expect(result).toEqual({ ok: true, wabaRecordId: "waba-record-1" })
  })

  it("returns ok: true with no phone numbers (empty list)", async () => {
    // No phone lookups needed
    const returning = vi.fn().mockResolvedValue([{ id: "waba-record-2" }])
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning })
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
    vi.mocked(db.insert).mockReturnValueOnce({ values } as any)

    const result = await storeOrUpdateConnection({
      orgId: "org-tenant-b",
      wabaId: "waba-2",
      wabaName: "Empty Phones WABA",
      accessToken: "token",
      scopes: [],
      connectionMode: "embedded_signup",
      connectionStatus: "pending_review",
      phoneNumbers: [],
    })

    expect(result).toEqual({ ok: true, wabaRecordId: "waba-record-2" })
    expect(db.select).not.toHaveBeenCalled() // no phone conflict check needed
  })
})

// ─── 15. markWabaDisconnected ─────────────────────────────────────────────────
describe("markWabaDisconnected", () => {
  it("sets status to disconnected on waba and marks phones inactive", async () => {
    // First update: WABA status
    const where1 = vi.fn().mockResolvedValue(undefined)
    const set1 = vi.fn().mockReturnValue({ where: where1 })
    vi.mocked(db.update).mockReturnValueOnce({ set: set1 } as any)

    // Select to find WABA id
    const limit2 = vi.fn().mockResolvedValue([{ id: "waba-record-3" }])
    const where2 = vi.fn().mockReturnValue({ limit: limit2 })
    const from2 = vi.fn().mockReturnValue({ where: where2 })
    vi.mocked(db.select).mockReturnValueOnce({ from: from2 } as any)

    // Second update: phone numbers
    const where3 = vi.fn().mockResolvedValue(undefined)
    const set3 = vi.fn().mockReturnValue({ where: where3 })
    vi.mocked(db.update).mockReturnValueOnce({ set: set3 } as any)

    await markWabaDisconnected("waba-123", "org-tenant-a")

    // Verify first update sets disconnected status
    expect(set1).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionStatus: "disconnected",
        status: "disconnected",
      })
    )

    // Verify second update sets phones inactive
    expect(set3).toHaveBeenCalledWith(
      expect.objectContaining({ status: "inactive" })
    )
  })

  it("does not update phones if WABA not found in DB", async () => {
    // First update: WABA status
    const where1 = vi.fn().mockResolvedValue(undefined)
    const set1 = vi.fn().mockReturnValue({ where: where1 })
    vi.mocked(db.update).mockReturnValueOnce({ set: set1 } as any)

    // Select returns empty (no matching WABA)
    const limit2 = vi.fn().mockResolvedValue([])
    const where2 = vi.fn().mockReturnValue({ limit: limit2 })
    const from2 = vi.fn().mockReturnValue({ where: where2 })
    vi.mocked(db.select).mockReturnValueOnce({ from: from2 } as any)

    await markWabaDisconnected("waba-ghost", "org-tenant-a")

    // Only 1 update call (phone update should be skipped)
    expect(db.update).toHaveBeenCalledTimes(1)
  })
})

// ─── 16. unsubscribeWabaFromApp — treat 100/200 errors as success ─────────────
describe("unsubscribeWabaFromApp", () => {
  it("resolves without error on successful DELETE", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    }))

    await expect(unsubscribeWabaFromApp("waba-123", "access-token")).resolves.toBeUndefined()
  })

  it("treats Meta error code 100 as success (already unsubscribed)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Not authorized", code: 100 } }),
    }))

    await expect(unsubscribeWabaFromApp("waba-123", "access-token")).resolves.toBeUndefined()
  })

  it("treats Meta error code 200 as success (not authorized)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Permission denied", code: 200 } }),
    }))

    await expect(unsubscribeWabaFromApp("waba-123", "access-token")).resolves.toBeUndefined()
  })

  it("throws on other Meta error codes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Server error", code: 500 } }),
    }))

    await expect(unsubscribeWabaFromApp("waba-123", "access-token")).rejects.toThrow()
  })

  it("resolves successfully when ok=false but error is 100", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { code: 100, message: "App was never subscribed" } }),
    }))

    // Should NOT throw
    await expect(unsubscribeWabaFromApp("waba-xyz", "token")).resolves.toBeUndefined()
  })
})

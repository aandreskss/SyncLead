import { describe, it, expect } from "vitest"
import { createHash } from "crypto"
import {
  normalizeEmail,
  normalizePhone,
  normalizeFirstName,
  normalizeCity,
  hashIfPresent,
  buildPurchasePayload,
} from "@/domains/conversions/payload"

function sha256(v: string) {
  return createHash("sha256").update(v).digest("hex")
}

// ─── normalizeEmail ───────────────────────────────────────────────────────────

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com")
  })

  it("returns null for null", () => {
    expect(normalizeEmail(null)).toBeNull()
  })

  it("returns null for undefined", () => {
    expect(normalizeEmail(undefined)).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(normalizeEmail("")).toBeNull()
  })

  it("returns null for whitespace-only string", () => {
    expect(normalizeEmail("   ")).toBeNull()
  })
})

// ─── normalizePhone ───────────────────────────────────────────────────────────

describe("normalizePhone", () => {
  it("strips non-digit characters", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("15551234567")
  })

  it("handles already-digit string", () => {
    expect(normalizePhone("5491112345678")).toBe("5491112345678")
  })

  it("returns null for null", () => {
    expect(normalizePhone(null)).toBeNull()
  })

  it("returns null for undefined", () => {
    expect(normalizePhone(undefined)).toBeNull()
  })

  it("returns null when string contains no digits", () => {
    expect(normalizePhone("---")).toBeNull()
  })
})

// ─── normalizeFirstName ───────────────────────────────────────────────────────

describe("normalizeFirstName", () => {
  it("returns first word lowercased", () => {
    expect(normalizeFirstName("John Doe")).toBe("john")
  })

  it("handles single-word name", () => {
    expect(normalizeFirstName("MARIA")).toBe("maria")
  })

  it("handles multiple spaces between names", () => {
    expect(normalizeFirstName("  Ana   Torres  ")).toBe("ana")
  })

  it("returns null for null", () => {
    expect(normalizeFirstName(null)).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(normalizeFirstName("")).toBeNull()
  })

  it("returns null for whitespace-only string", () => {
    expect(normalizeFirstName("  ")).toBeNull()
  })
})

// ─── normalizeCity ────────────────────────────────────────────────────────────

describe("normalizeCity", () => {
  it("trims and lowercases", () => {
    expect(normalizeCity("  São Paulo  ")).toBe("são paulo")
  })

  it("returns null for null", () => {
    expect(normalizeCity(null)).toBeNull()
  })

  it("returns null for whitespace-only", () => {
    expect(normalizeCity("  ")).toBeNull()
  })
})

// ─── hashIfPresent ────────────────────────────────────────────────────────────

describe("hashIfPresent", () => {
  it("returns [sha256(value)] for a non-empty string", () => {
    const val = "test@example.com"
    expect(hashIfPresent(val)).toEqual([sha256(val)])
  })

  it("returns [] for null", () => {
    expect(hashIfPresent(null)).toEqual([])
  })

  it("returns [] for empty string", () => {
    expect(hashIfPresent("")).toEqual([])
  })

  it("hashes are exactly 64 hex characters (SHA-256)", () => {
    const [hash] = hashIfPresent("hello")
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ─── buildPurchasePayload ─────────────────────────────────────────────────────

const baseInput = {
  conversionId: "conv-abc-123",
  lead: {
    email: "user@test.com",
    phone: "+1-555-0000",
    name: "Jane Smith",
    city: "New York",
    fbc: "_fbc_AbCdEfGh",
    fbp: "_fbp_XyZ",
    ip: "192.168.1.1",
    userAgent: "Mozilla/5.0",
    landingUrl: "https://example.com/landing",
  },
  amount: "199.99",
  currency: "USD",
  orderId: "ORDER-001",
  convertedAt: new Date("2025-01-15T12:00:00.000Z"),
}

describe("buildPurchasePayload", () => {
  it("sets correct event_name and action_source", () => {
    const p = buildPurchasePayload(baseInput)
    expect(p.event_name).toBe("Purchase")
    expect(p.action_source).toBe("website")
  })

  it("derives event_id from conversionId (stable, deterministic)", () => {
    const p = buildPurchasePayload(baseInput)
    expect(p.event_id).toBe("purchase_conv-abc-123")
  })

  it("same conversionId always yields the same event_id regardless of other fields", () => {
    const p1 = buildPurchasePayload(baseInput)
    const p2 = buildPurchasePayload({ ...baseInput, orderId: "ORDER-999", amount: "50.00" })
    expect(p1.event_id).toBe(p2.event_id)
  })

  it("derives event_time from convertedAt, not sent_at", () => {
    const p = buildPurchasePayload(baseInput)
    expect(p.event_time).toBe(Math.floor(new Date("2025-01-15T12:00:00.000Z").getTime() / 1000))
  })

  it("includes event_source_url when landingUrl is set", () => {
    const p = buildPurchasePayload(baseInput)
    expect(p.event_source_url).toBe("https://example.com/landing")
  })

  it("omits event_source_url when landingUrl is null", () => {
    const p = buildPurchasePayload({ ...baseInput, lead: { ...baseInput.lead, landingUrl: null } })
    expect(p.event_source_url).toBeUndefined()
  })

  it("hashes email after normalize (lowercase, trimmed)", () => {
    const p = buildPurchasePayload(baseInput)
    expect(p.user_data.em).toEqual([sha256("user@test.com")])
  })

  it("hashes phone as digits-only", () => {
    const p = buildPurchasePayload(baseInput)
    expect(p.user_data.ph).toEqual([sha256("15550000")])
  })

  it("hashes first name (first word, lowercase)", () => {
    const p = buildPurchasePayload(baseInput)
    expect(p.user_data.fn).toEqual([sha256("jane")])
  })

  it("hashes city (lowercase)", () => {
    const p = buildPurchasePayload(baseInput)
    expect(p.user_data.ct).toEqual([sha256("new york")])
  })

  it("sends fbc verbatim (no hash)", () => {
    const p = buildPurchasePayload(baseInput)
    expect(p.user_data.fbc).toBe("_fbc_AbCdEfGh")
  })

  it("sends fbp verbatim (no hash)", () => {
    const p = buildPurchasePayload(baseInput)
    expect(p.user_data.fbp).toBe("_fbp_XyZ")
  })

  it("sends ip verbatim as client_ip_address", () => {
    const p = buildPurchasePayload(baseInput)
    expect(p.user_data.client_ip_address).toBe("192.168.1.1")
  })

  it("sends userAgent verbatim as client_user_agent", () => {
    const p = buildPurchasePayload(baseInput)
    expect(p.user_data.client_user_agent).toBe("Mozilla/5.0")
  })

  it("omits em, ph, fn, ct when fields are null", () => {
    const p = buildPurchasePayload({
      ...baseInput,
      lead: { ...baseInput.lead, email: null, phone: null, city: null },
    })
    expect(p.user_data.em).toBeUndefined()
    expect(p.user_data.ph).toBeUndefined()
    expect(p.user_data.ct).toBeUndefined()
  })

  it("omits em when email normalizes to empty", () => {
    const p = buildPurchasePayload({ ...baseInput, lead: { ...baseInput.lead, email: "   " } })
    expect(p.user_data.em).toBeUndefined()
  })

  it("omits ph when phone has no digits", () => {
    const p = buildPurchasePayload({ ...baseInput, lead: { ...baseInput.lead, phone: "---" } })
    expect(p.user_data.ph).toBeUndefined()
  })

  it("omits fbc/fbp/ip/ua when null", () => {
    const p = buildPurchasePayload({
      ...baseInput,
      lead: { ...baseInput.lead, fbc: null, fbp: null, ip: null, userAgent: null },
    })
    expect(p.user_data.fbc).toBeUndefined()
    expect(p.user_data.fbp).toBeUndefined()
    expect(p.user_data.client_ip_address).toBeUndefined()
    expect(p.user_data.client_user_agent).toBeUndefined()
  })

  it("stores amount as a number (not string) in custom_data.value", () => {
    const p = buildPurchasePayload(baseInput)
    expect(typeof p.custom_data.value).toBe("number")
    expect(p.custom_data.value).toBe(199.99)
  })

  it("includes order_id and uppercase currency in custom_data", () => {
    const p = buildPurchasePayload({ ...baseInput, currency: "usd" })
    expect(p.custom_data.order_id).toBe("ORDER-001")
    expect(p.custom_data.currency).toBe("USD")
  })

  it("does not include test_event_code anywhere in the payload", () => {
    const p = buildPurchasePayload(baseInput) as unknown as Record<string, unknown>
    expect(p.test_event_code).toBeUndefined()
    expect((p.user_data as Record<string, unknown>).test_event_code).toBeUndefined()
    expect((p.custom_data as Record<string, unknown>).test_event_code).toBeUndefined()
  })
})

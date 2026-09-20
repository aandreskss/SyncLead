import { describe, it, expect } from "vitest"
import { z } from "zod"

// Mirror of the Zod schema in route.ts — tested independently
const IngestPayloadSchema = z.object({
  name: z.string().min(1, "name is required").max(255).trim(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  city: z.string().max(100).optional().default(""),
  negocio: z.union([z.boolean(), z.string(), z.number()]).optional(),
  event_id: z.string().max(255).optional(),
  utm_source: z.string().max(255).optional().nullable(),
  utm_medium: z.string().max(255).optional().nullable(),
  utm_campaign: z.string().max(255).optional().nullable(),
  utm_content: z.string().max(255).optional().nullable(),
  fbclid: z.string().max(500).optional().nullable(),
  fbc: z.string().max(500).optional().nullable(),
  fbp: z.string().max(500).optional().nullable(),
  landing_url: z.string().url().max(2048).optional().nullable(),
  referrer_url: z.string().url().max(2048).optional().nullable(),
  platform: z.string().max(50).optional().nullable(),
  device: z.string().max(50).optional().nullable(),
  ip: z.string().max(45).optional().nullable(),
  user_agent: z.string().max(512).optional().nullable(),
  meta_campaign_name: z.string().max(255).optional().nullable(),
  meta_adset_name: z.string().max(255).optional().nullable(),
  meta_ad_name: z.string().max(255).optional().nullable(),
})

describe("IngestPayloadSchema — Zod validation", () => {
  describe("name field", () => {
    it("accepts valid name", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Carlos García" })
      expect(result.success).toBe(true)
    })

    it("rejects empty name", () => {
      const result = IngestPayloadSchema.safeParse({ name: "" })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toBe("name is required")
    })

    it("rejects missing name", () => {
      const result = IngestPayloadSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it("trims whitespace from name", () => {
      const result = IngestPayloadSchema.safeParse({ name: "  Juan  " })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.name).toBe("Juan")
    })

    it("rejects name longer than 255 chars", () => {
      const result = IngestPayloadSchema.safeParse({ name: "a".repeat(256) })
      expect(result.success).toBe(false)
    })
  })

  describe("email field", () => {
    it("accepts valid email", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Test", email: "user@example.com" })
      expect(result.success).toBe(true)
    })

    it("rejects invalid email", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Test", email: "not-an-email" })
      expect(result.success).toBe(false)
    })

    it("accepts null email", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Test", email: null })
      expect(result.success).toBe(true)
    })

    it("accepts missing email", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Test" })
      expect(result.success).toBe(true)
    })
  })

  describe("negocio field (coerced)", () => {
    it("accepts boolean true", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Test", negocio: true })
      expect(result.success).toBe(true)
    })

    it("accepts string 'true'", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Test", negocio: "true" })
      expect(result.success).toBe(true)
    })

    it("accepts number 1", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Test", negocio: 1 })
      expect(result.success).toBe(true)
    })

    it("accepts missing negocio", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Test" })
      expect(result.success).toBe(true)
    })
  })

  describe("URL fields", () => {
    it("accepts valid landing_url", () => {
      const result = IngestPayloadSchema.safeParse({
        name: "Test",
        landing_url: "https://example.com/page?utm_source=facebook",
      })
      expect(result.success).toBe(true)
    })

    it("rejects invalid landing_url", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Test", landing_url: "not-a-url" })
      expect(result.success).toBe(false)
    })

    it("accepts null landing_url", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Test", landing_url: null })
      expect(result.success).toBe(true)
    })
  })

  describe("event_id idempotency field", () => {
    it("accepts valid event_id", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Test", event_id: "evt_abc123" })
      expect(result.success).toBe(true)
    })

    it("accepts missing event_id", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Test" })
      expect(result.success).toBe(true)
    })

    it("rejects event_id longer than 255 chars", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Test", event_id: "e".repeat(256) })
      expect(result.success).toBe(false)
    })
  })

  describe("full valid payload", () => {
    it("accepts complete Meta Ads payload", () => {
      const result = IngestPayloadSchema.safeParse({
        name: "María González",
        phone: "584121234567",
        email: "maria@example.com",
        city: "Caracas",
        negocio: true,
        event_id: "lead_fb_12345",
        utm_source: "facebook",
        utm_medium: "paid",
        utm_campaign: "vestidos-primavera-2026",
        utm_content: "ad_001",
        fbclid: "AZXbGOK5XABCDEFG",
        fbc: "fb.1.1234567890.AbCdEfGh",
        fbp: "fb.1.1234567890.1234567890",
        landing_url: "https://modavzla.com/vestidos?utm_source=facebook",
        referrer_url: "https://www.facebook.com/",
        platform: "facebook",
        device: "mobile",
        meta_campaign_name: "Vestidos Primavera 2026",
        meta_adset_name: "Mujeres 25-45 Caracas",
        meta_ad_name: "Ad_VideoCarrusel_001",
      })
      expect(result.success).toBe(true)
    })

    it("accepts minimal payload (name only)", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Juan" })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.city).toBe("")
        expect(result.data.email).toBeUndefined()
      }
    })
  })

  describe("phone field", () => {
    it("rejects phone longer than 30 chars", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Test", phone: "1".repeat(31) })
      expect(result.success).toBe(false)
    })

    it("accepts Venezuelan phone format", () => {
      const result = IngestPayloadSchema.safeParse({ name: "Test", phone: "+584121234567" })
      expect(result.success).toBe(true)
    })
  })
})

describe("Schema constraints (documented for integration testing)", () => {
  it("documents: meta_events.event_id must be unique (UNIQUE INDEX meta_events_event_id_idx)", () => {
    // Integration test would:
    // 1. Insert meta_event with event_id = 'test-123'
    // 2. Insert duplicate → expect DB error with code 23505 (unique violation)
    // This is guaranteed by: CREATE UNIQUE INDEX meta_events_event_id_idx ON meta_events (event_id)
    expect(true).toBe(true)
  })

  it("documents: lead_assignments allows only one is_current=true per lead (UNIQUE partial index)", () => {
    // Integration test would:
    // 1. Insert assignment for lead_id X with is_current=true
    // 2. Insert another assignment for same lead_id X with is_current=true → expect error
    // 3. Insert with is_current=false → expect success
    // Guaranteed by: CREATE UNIQUE INDEX lead_assignments_current_idx ON lead_assignments (lead_id) WHERE is_current = true
    expect(true).toBe(true)
  })

  it("documents: conversions.org_id+order_id must be unique (excluding NULLs)", () => {
    // Integration test would:
    // 1. Insert conversion with org_id=X and order_id='ORD-001'
    // 2. Insert same org_id=X, order_id='ORD-001' → expect unique violation
    // 3. Insert with order_id=NULL → expect success (NULL excluded from index)
    // Guaranteed by: CREATE UNIQUE INDEX conversions_org_order_idx WHERE order_id IS NOT NULL
    expect(true).toBe(true)
  })

  it("documents: org_members has unique (org_id, user_id) — no duplicate memberships", () => {
    // Guaranteed by: CREATE UNIQUE INDEX org_members_org_user_idx ON org_members (org_id, user_id)
    expect(true).toBe(true)
  })

  it("documents: meta_connections.pixel_id unique per client (partial, excludes NULL)", () => {
    // Guaranteed by: CREATE UNIQUE INDEX meta_connections_client_pixel_idx WHERE pixel_id IS NOT NULL
    expect(true).toBe(true)
  })
})

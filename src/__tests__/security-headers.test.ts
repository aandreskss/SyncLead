import { describe, it, expect } from "vitest"
import { redactForLog, safeErrorSummary, publicErrorBody, looksLikeSecret } from "@/lib/redact"
import { redactIp } from "@/lib/audit"

// ─── redactForLog ─────────────────────────────────────────────────────────────

describe("redactForLog", () => {
  it("redacts top-level PII keys", () => {
    const result = redactForLog({
      email: "user@example.com",
      phone: "+15555555555",
      name: "John Doe",
      orgId: "org-123",
    }) as Record<string, unknown>
    expect(result.email).toBe("[REDACTED]")
    expect(result.phone).toBe("[REDACTED]")
    expect(result.name).toBe("[REDACTED]")
    expect(result.orgId).toBe("org-123")
  })

  it("redacts token and secret keys", () => {
    const result = redactForLog({
      token: "abc123",
      accessToken: "tok_xxx",
      secret: "supersecret",
      apiKey: "key_yyy",
      authSecret: "s3cr3t",
    }) as Record<string, unknown>
    expect(result.token).toBe("[REDACTED]")
    expect(result.accessToken).toBe("[REDACTED]")
    expect(result.secret).toBe("[REDACTED]")
    expect(result.apiKey).toBe("[REDACTED]")
    expect(result.authSecret).toBe("[REDACTED]")
  })

  it("redacts nested PII keys", () => {
    const result = redactForLog({
      user: { email: "a@b.com", id: "u1" },
      stats: { count: 5 },
    }) as Record<string, unknown>
    const user = result.user as Record<string, unknown>
    expect(user.email).toBe("[REDACTED]")
    expect(user.id).toBe("u1")
  })

  it("preserves non-PII primitives", () => {
    const result = redactForLog({ count: 42, active: true, label: "test" }) as Record<string, unknown>
    expect(result.count).toBe(42)
    expect(result.active).toBe(true)
    expect(result.label).toBe("test")
  })

  it("handles arrays", () => {
    const result = redactForLog([{ email: "x@y.com", id: "1" }]) as Array<Record<string, unknown>>
    expect(result[0].email).toBe("[REDACTED]")
    expect(result[0].id).toBe("1")
  })

  it("handles null/undefined without throwing", () => {
    expect(redactForLog(null)).toBeNull()
    expect(redactForLog(undefined)).toBeUndefined()
  })

  it("enforces depth limit", () => {
    let deep: Record<string, unknown> = { val: "leaf" }
    for (let i = 0; i < 10; i++) deep = { child: deep }
    const result = redactForLog(deep)
    expect(JSON.stringify(result)).toContain("DEPTH_LIMIT")
  })

  it("is case-sensitive on known PII keys", () => {
    const result = redactForLog({ EMAIL: "x", email: "y" }) as Record<string, unknown>
    // Lowercase check via PII_KEYS.has(k.toLowerCase())
    expect(result.EMAIL).toBe("[REDACTED]")
    expect(result.email).toBe("[REDACTED]")
  })
})

// ─── safeErrorSummary ─────────────────────────────────────────────────────────

describe("safeErrorSummary", () => {
  it("returns error name only", () => {
    expect(safeErrorSummary(new TypeError("bad input"))).toBe("[TypeError]")
    expect(safeErrorSummary(new Error("secret token abc123"))).toBe("[Error]")
  })

  it("handles non-Error values", () => {
    expect(safeErrorSummary("string")).toBe("[UnknownError]")
    expect(safeErrorSummary(null)).toBe("[UnknownError]")
    expect(safeErrorSummary(42)).toBe("[UnknownError]")
  })
})

// ─── publicErrorBody ──────────────────────────────────────────────────────────

describe("publicErrorBody", () => {
  it("returns error and correlationId, no internals", () => {
    const body = publicErrorBody("corr-123")
    expect(body.correlationId).toBe("corr-123")
    expect(body.error).toBeTruthy()
    expect(Object.keys(body)).toEqual(["error", "correlationId"])
  })

  it("accepts custom user message", () => {
    const body = publicErrorBody("c1", "Invalid date format")
    expect(body.error).toBe("Invalid date format")
  })
})

// ─── looksLikeSecret ──────────────────────────────────────────────────────────

describe("looksLikeSecret", () => {
  it("detects long hex strings", () => {
    expect(looksLikeSecret("a".repeat(32))).toBe(true)
    expect(looksLikeSecret("deadbeef".repeat(4))).toBe(true)
  })

  it("detects base64 blobs", () => {
    expect(looksLikeSecret("A".repeat(40) + "==")).toBe(true)
  })

  it("detects common secret prefixes", () => {
    expect(looksLikeSecret("sk_live_abc123")).toBe(true)
    expect(looksLikeSecret("pk_test_xyz")).toBe(true)
    expect(looksLikeSecret("slk_abc123")).toBe(true)
    expect(looksLikeSecret("eyJhbGci")).toBe(true)
  })

  it("passes benign strings", () => {
    expect(looksLikeSecret("hello world")).toBe(false)
    expect(looksLikeSecret("123456")).toBe(false)
    expect(looksLikeSecret("some-normal-value")).toBe(false)
  })
})

// ─── redactIp ─────────────────────────────────────────────────────────────────

describe("redactIp", () => {
  it("redacts IPv4 last octet", () => {
    expect(redactIp("192.168.1.100")).toBe("192.168.1.xxx")
    expect(redactIp("10.0.0.1")).toBe("10.0.0.xxx")
  })

  it("keeps first 3 groups for IPv6", () => {
    const result = redactIp("2001:db8:85a3::8a2e:370:7334")
    expect(result).toMatch(/^2001:db8:85a3:/)
    expect(result).not.toContain("8a2e")
  })

  it("returns null for falsy input", () => {
    expect(redactIp(null)).toBeNull()
    expect(redactIp(undefined)).toBeNull()
    expect(redactIp("")).toBeNull()
  })

  it("returns null for malformed IPv4", () => {
    expect(redactIp("not.an.ip")).toBeNull()
  })
})

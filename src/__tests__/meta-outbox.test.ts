import { vi, describe, it, expect, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      metaEvents: { findFirst: vi.fn() },
    },
    update: vi.fn(),
  },
}))

vi.mock("@/domains/meta/repository", () => ({
  getActiveMetaConnectionByPixelId: vi.fn(),
}))

vi.mock("@/lib/crypto", () => ({
  decryptTokenVersioned: vi.fn(),
}))

import { db } from "@/lib/db"
import { getActiveMetaConnectionByPixelId } from "@/domains/meta/repository"
import { decryptTokenVersioned } from "@/lib/crypto"
import { classifyMetaErrorCode, classifyHttpStatus } from "@/lib/meta-outbox/classify"
import { computeBackoff, DEFAULT_MAX_ATTEMPTS } from "@/lib/meta-outbox/backoff"
import { sendMetaEventDirect, processOneMetaEvent } from "@/lib/meta-outbox/worker"

const mockFindFirst = vi.mocked(db.query.metaEvents.findFirst)
const mockUpdate = vi.mocked(db.update)
const mockGetConn = vi.mocked(getActiveMetaConnectionByPixelId)
const mockDecrypt = vi.mocked(decryptTokenVersioned)

// Builds the Drizzle update chain mock.
// The atomic claim in processOneMetaEvent calls .set().where().returning().
// markXxx calls await .set().where() without .returning().
function makeUpdateChain(claimRows: Record<string, unknown>[] = []) {
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => {
        const p = Promise.resolve(undefined) as any
        p.returning = vi.fn().mockResolvedValue(claimRows)
        return p
      }),
    }),
  } as any)
}

function mockFetch(body: object, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }))
}

const BASE_EVENT = {
  id: "evt-001",
  orgId: "org-tenant-a",
  leadId: "lead-001",
  conversionId: "conv-001",
  pixelId: "PIXEL_ABCD1234",
  eventName: "Purchase",
  eventId: "purchase_conv-001",
  payloadVersion: 1,
  payload: { event_name: "Purchase", event_time: 1700000000, event_id: "purchase_conv-001" },
  status: "pending" as const,
  attemptCount: 0,
  lockedUntil: null,
  nextAttemptAt: null,
  lastError: null,
  lastResponse: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
}

const BASE_CONN = {
  id: "conn-001",
  orgId: "org-tenant-a",
  pixelId: "PIXEL_ABCD1234",
  accessTokenEnc: "v1:encrypteddata",
  graphApiVersion: "v19.0",
  status: "active",
}

beforeEach(() => {
  vi.clearAllMocks()
  makeUpdateChain([]) // default: atomic claim returns no row (simulates second-worker scenario)
})

// ─── classifyMetaErrorCode ────────────────────────────────────────────────────

describe("classifyMetaErrorCode", () => {
  it.each([190, 102, 200, 273, 100] as const)(
    "code %i → permanent (retrying won't help)",
    (code) => {
      expect(classifyMetaErrorCode(code)).toBe("permanent")
    }
  )

  it.each([80001, 80002, 4] as const)(
    "code %i → retryable (rate limit / transient)",
    (code) => {
      expect(classifyMetaErrorCode(code)).toBe("retryable")
    }
  )

  it("null → retryable (unknown error assumed transient)", () => {
    expect(classifyMetaErrorCode(null)).toBe("retryable")
  })

  it("unknown code → retryable (fail-safe for future Meta codes)", () => {
    expect(classifyMetaErrorCode(9999)).toBe("retryable")
  })
})

// ─── classifyHttpStatus ───────────────────────────────────────────────────────

describe("classifyHttpStatus", () => {
  it("429 → retryable", () => expect(classifyHttpStatus(429)).toBe("retryable"))
  it("500 → retryable", () => expect(classifyHttpStatus(500)).toBe("retryable"))
  it("503 → retryable", () => expect(classifyHttpStatus(503)).toBe("retryable"))
  it("401 → permanent", () => expect(classifyHttpStatus(401)).toBe("permanent"))
  it("403 → permanent", () => expect(classifyHttpStatus(403)).toBe("permanent"))
  it("400 → permanent", () => expect(classifyHttpStatus(400)).toBe("permanent"))
  it("422 → permanent", () => expect(classifyHttpStatus(422)).toBe("permanent"))
})

// ─── computeBackoff ───────────────────────────────────────────────────────────

describe("computeBackoff", () => {
  it("grows with attempt number (no jitter)", () => {
    const a1 = computeBackoff(1, { baseMs: 1000, jitter: 0 })
    const a3 = computeBackoff(3, { baseMs: 1000, jitter: 0 })
    const a5 = computeBackoff(5, { baseMs: 1000, jitter: 0 })
    expect(a3).toBeGreaterThan(a1)
    expect(a5).toBeGreaterThan(a3)
  })

  it("never exceeds maxMs", () => {
    for (let attempt = 1; attempt <= 15; attempt++) {
      const val = computeBackoff(attempt, { baseMs: 60_000, maxMs: 3_600_000 })
      expect(val).toBeLessThanOrEqual(3_600_000)
    }
  })

  it("applies jitter within ±jitter fraction of the base delay", () => {
    const baseMs = 60_000
    const jitter = 0.2
    for (let i = 0; i < 30; i++) {
      const val = computeBackoff(1, { baseMs, maxMs: Infinity, jitter })
      expect(val).toBeGreaterThanOrEqual(Math.round(baseMs * (1 - jitter)))
      expect(val).toBeLessThanOrEqual(Math.round(baseMs * (1 + jitter)))
    }
  })

  it("attempt 1 with no jitter equals baseMs", () => {
    expect(computeBackoff(1, { baseMs: 30_000, jitter: 0, maxMs: Infinity })).toBe(30_000)
  })
})

// ─── sendMetaEventDirect ──────────────────────────────────────────────────────

describe("sendMetaEventDirect", () => {
  it("returns not_found when event does not exist in DB", async () => {
    mockFindFirst.mockResolvedValue(undefined)
    const r = await sendMetaEventDirect("nonexistent-id", "org-tenant-a")
    expect(r).toEqual({ sent: false, status: "not_found" })
  })

  it("returns already_sent for events with status='sent'", async () => {
    mockFindFirst.mockResolvedValue({ ...BASE_EVENT, status: "sent" })
    const r = await sendMetaEventDirect("evt-001", "org-tenant-a")
    expect(r).toEqual({ sent: true, status: "already_sent" })
  })

  it("returns no_connection and skips when no active Meta connection", async () => {
    mockFindFirst.mockResolvedValue(BASE_EVENT)
    mockGetConn.mockResolvedValue(undefined)
    const r = await sendMetaEventDirect("evt-001", "org-tenant-a")
    expect(r).toEqual({ sent: false, status: "no_connection" })
  })

  it("returns decrypt_error when token decryption fails", async () => {
    mockFindFirst.mockResolvedValue(BASE_EVENT)
    mockGetConn.mockResolvedValue(BASE_CONN as any)
    mockDecrypt.mockImplementation(() => { throw new Error("bad key material") })
    const r = await sendMetaEventDirect("evt-001", "org-tenant-a")
    expect(r).toEqual({ sent: false, status: "decrypt_error" })
  })

  it("returns sent:true when Meta reports events_received >= 1", async () => {
    mockFindFirst.mockResolvedValue(BASE_EVENT)
    mockGetConn.mockResolvedValue(BASE_CONN as any)
    mockDecrypt.mockReturnValue("VALID_ACCESS_TOKEN")
    mockFetch({ events_received: 1, fbtrace_id: "fb-trace-001" })

    const r = await sendMetaEventDirect("evt-001", "org-tenant-a")
    expect(r.sent).toBe(true)
    expect(r.status).toContain("sent:1")
  })

  it("treats events_received=0 as failure even on HTTP 200", async () => {
    mockFindFirst.mockResolvedValue(BASE_EVENT)
    mockGetConn.mockResolvedValue(BASE_CONN as any)
    mockDecrypt.mockReturnValue("VALID_ACCESS_TOKEN")
    mockFetch({ events_received: 0, fbtrace_id: "fb-trace-002" })

    const r = await sendMetaEventDirect("evt-001", "org-tenant-a")
    expect(r.sent).toBe(false)
  })

  it("returns sent:false on permanent Meta error (token expired, code 190)", async () => {
    mockFindFirst.mockResolvedValue(BASE_EVENT)
    mockGetConn.mockResolvedValue(BASE_CONN as any)
    mockDecrypt.mockReturnValue("EXPIRED_TOKEN")
    mockFetch({ error: { code: 190, message: "Token expired", fbtrace_id: "err-trace" } }, 400)

    const r = await sendMetaEventDirect("evt-001", "org-tenant-a")
    expect(r.sent).toBe(false)
    expect(r.status).toContain("190")
  })

  it("returns sent:false on retryable error without permanently failing", async () => {
    mockFindFirst.mockResolvedValue(BASE_EVENT)
    mockGetConn.mockResolvedValue(BASE_CONN as any)
    mockDecrypt.mockReturnValue("VALID_ACCESS_TOKEN")
    mockFetch({ error: { code: 80001, message: "Rate limited" } }, 429)

    const r = await sendMetaEventDirect("evt-001", "org-tenant-a")
    expect(r.sent).toBe(false)
    // status summary should contain the error info, not "failed permanently"
    expect(r.status).not.toContain("decrypt_error")
    expect(r.status).not.toContain("no_connection")
  })

  it("tenant isolation: queries connection using event.orgId, not a hardcoded value", async () => {
    const evtOrgB = { ...BASE_EVENT, orgId: "org-tenant-b" }
    mockFindFirst.mockResolvedValue(evtOrgB)
    mockGetConn.mockResolvedValue(undefined)
    await sendMetaEventDirect("evt-001", "org-tenant-b")
    expect(mockGetConn).toHaveBeenCalledWith("PIXEL_ABCD1234", "org-tenant-b")
    expect(mockGetConn).not.toHaveBeenCalledWith(expect.anything(), "org-tenant-a")
  })
})

// ─── processOneMetaEvent ──────────────────────────────────────────────────────

describe("processOneMetaEvent", () => {
  it("returns found:false when no pending event can be claimed (concurrent worker)", async () => {
    makeUpdateChain([]) // simulate second worker: UPDATE returns 0 rows
    const r = await processOneMetaEvent()
    expect(r.found).toBe(false)
    expect(r.processed).toBe(0)
    expect(r.sent).toBe(0)
  })

  it("returns found:true and skipped:1 when claimed event has no pixelId", async () => {
    makeUpdateChain([{ ...BASE_EVENT, pixelId: null }])
    const r = await processOneMetaEvent()
    expect(r.found).toBe(true)
    expect(r.processed).toBe(1)
    expect(r.skipped).toBe(1)
  })

  it("returns found:true and skipped:1 when no active Meta connection", async () => {
    makeUpdateChain([BASE_EVENT])
    mockGetConn.mockResolvedValue(undefined)
    const r = await processOneMetaEvent()
    expect(r.found).toBe(true)
    expect(r.skipped).toBe(1)
  })

  it("returns sent:1 on successful Meta send (events_received >= 1)", async () => {
    makeUpdateChain([BASE_EVENT])
    mockGetConn.mockResolvedValue(BASE_CONN as any)
    mockDecrypt.mockReturnValue("VALID_ACCESS_TOKEN")
    mockFetch({ events_received: 1, fbtrace_id: "fb-trace-success" })

    const r = await processOneMetaEvent()
    expect(r.found).toBe(true)
    expect(r.sent).toBe(1)
    expect(r.failed).toBe(0)
    expect(r.retried).toBe(0)
  })

  it("returns failed:1 on permanent Meta error (no retry)", async () => {
    makeUpdateChain([BASE_EVENT])
    mockGetConn.mockResolvedValue(BASE_CONN as any)
    mockDecrypt.mockReturnValue("VALID_ACCESS_TOKEN")
    mockFetch({ error: { code: 190, message: "Token expired" } }, 400)

    const r = await processOneMetaEvent()
    expect(r.found).toBe(true)
    expect(r.failed).toBe(1)
    expect(r.retried).toBe(0)
  })

  it("returns retried:1 on retryable error when below MAX_ATTEMPTS", async () => {
    makeUpdateChain([{ ...BASE_EVENT, attemptCount: 0 }])
    mockGetConn.mockResolvedValue(BASE_CONN as any)
    mockDecrypt.mockReturnValue("VALID_ACCESS_TOKEN")
    mockFetch({ error: { code: 80001, message: "Rate limit" } }, 429)

    const r = await processOneMetaEvent()
    expect(r.found).toBe(true)
    expect(r.retried).toBe(1)
    expect(r.failed).toBe(0)
  })

  it("dead-letters (failed:1) when attemptCount reaches MAX_ATTEMPTS on retryable error", async () => {
    makeUpdateChain([{ ...BASE_EVENT, attemptCount: DEFAULT_MAX_ATTEMPTS - 1 }])
    mockGetConn.mockResolvedValue(BASE_CONN as any)
    mockDecrypt.mockReturnValue("VALID_ACCESS_TOKEN")
    // Retryable error — but attempt limit exhausted
    mockFetch({ error: { code: 80001, message: "Rate limit" } }, 429)

    const r = await processOneMetaEvent()
    expect(r.found).toBe(true)
    expect(r.failed).toBe(1)
    expect(r.retried).toBe(0)
  })

  it("tenant isolation: connection is looked up using the event's orgId", async () => {
    const evtOrgC = { ...BASE_EVENT, orgId: "org-tenant-c" }
    makeUpdateChain([evtOrgC])
    mockGetConn.mockResolvedValue(undefined)
    await processOneMetaEvent()
    expect(mockGetConn).toHaveBeenCalledWith("PIXEL_ABCD1234", "org-tenant-c")
    expect(mockGetConn).not.toHaveBeenCalledWith(expect.anything(), "org-tenant-a")
  })
})

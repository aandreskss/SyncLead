import { describe, it, expect, vi, beforeEach } from "vitest"
import { JOB_REGISTRY } from "@/lib/jobs/registry"

// ─── Registry tests — pure, no DB ─────────────────────────────────────────────

describe("JOB_REGISTRY", () => {
  const knownJobs = ["meta-outbox", "meta-insights-sync", "cleanup", "retention-cleanup"]

  it("contains all known jobs", () => {
    for (const job of knownJobs) {
      expect(JOB_REGISTRY[job], `missing job: ${job}`).toBeDefined()
    }
  })

  it("every job has timeBudgetMs < maxDurationSec * 1000", () => {
    for (const [name, meta] of Object.entries(JOB_REGISTRY)) {
      expect(
        meta.timeBudgetMs,
        `${name}.timeBudgetMs must be less than maxDuration`
      ).toBeLessThan(meta.maxDurationSec * 1000)
    }
  })

  it("every job has a schedule string", () => {
    for (const meta of Object.values(JOB_REGISTRY)) {
      expect(meta.schedule).toBeTruthy()
    }
  })

  it("timeBudgetMs leaves at least 5s buffer before maxDuration", () => {
    for (const [name, meta] of Object.entries(JOB_REGISTRY)) {
      const bufferMs = meta.maxDurationSec * 1000 - meta.timeBudgetMs
      expect(bufferMs, `${name} needs ≥5000ms buffer`).toBeGreaterThanOrEqual(5000)
    }
  })
})

// ─── withJobRun — mocked DB ───────────────────────────────────────────────────

// Mock the DB module to avoid real connections in unit tests
vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "mock-run-id" }])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
}))

// Need to reset mocks between tests
import { db } from "@/lib/db"
import { withJobRun } from "@/lib/jobs/runner"

describe("withJobRun", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns correlationId and ok=true on success", async () => {
    const result = await withJobRun("test-job", async () => ({
      itemsProcessed: 5,
      itemsFailed: 0,
      result: { count: 5 },
    }))

    expect(result.ok).toBe(true)
    expect(result.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it("returns ok=false and captures error name on thrown error", async () => {
    const result = await withJobRun("test-job", async () => {
      throw new TypeError("bad input")
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe("TypeError")
    expect(result.correlationId).toBeDefined()
  })

  it("does not expose error message (only error name)", async () => {
    const secretMsg = "token=sk_live_secret_value_123"
    const result = await withJobRun("test-job", async () => {
      throw new Error(secretMsg)
    })

    expect(result.error).toBe("Error")
    expect(result.error).not.toContain(secretMsg)
  })

  it("calls job function even if DB insert fails", async () => {
    // Simulate DB insert failure
    vi.mocked(db.insert).mockImplementationOnce(() => {
      throw new Error("DB unavailable")
    })

    let jobRan = false
    const result = await withJobRun("test-job", async () => {
      jobRan = true
      return { itemsProcessed: 1 }
    })

    expect(jobRan).toBe(true)
    expect(result.ok).toBe(true)
  })

  it("provides isOverBudget in context", async () => {
    let overBudgetLarge: boolean | undefined
    let overBudgetNegative: boolean | undefined

    await withJobRun("test-job", async (ctx) => {
      overBudgetLarge = ctx.isOverBudget(100_000)  // 100s — not exceeded
      overBudgetNegative = ctx.isOverBudget(-1)    // -1ms — always exceeded
      return {}
    })

    expect(overBudgetLarge).toBe(false)
    expect(overBudgetNegative).toBe(true)
  })

  it("generates unique correlationId per run", async () => {
    const ids = await Promise.all([
      withJobRun("j", async () => ({})).then((r) => r.correlationId),
      withJobRun("j", async () => ({})).then((r) => r.correlationId),
      withJobRun("j", async () => ({})).then((r) => r.correlationId),
    ])
    const unique = new Set(ids)
    expect(unique.size).toBe(3)
  })
})

// ─── isOverBudget behavior ────────────────────────────────────────────────────

describe("isOverBudget time logic", () => {
  it("returns false for a large budget that has not been exceeded", async () => {
    let result: boolean | undefined

    await withJobRun("test-job", async (ctx) => {
      result = ctx.isOverBudget(60_000) // 60s budget — definitely not exceeded in a unit test
      return {}
    })

    expect(result).toBe(false)
  })

  it("returns true for a budget of -1ms (always exceeded)", async () => {
    let result: boolean | undefined

    await withJobRun("test-job", async (ctx) => {
      result = ctx.isOverBudget(-1) // -1ms budget: elapsed > -1 is always true
      return {}
    })

    expect(result).toBe(true)
  })
})

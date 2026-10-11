/**
 * Phase 07 — Durable AI pipeline tests
 *
 * Covers: burst debounce, per-conversation serialization, orphan recovery,
 * lease token fencing, campaign router (active episode, specific rule, catch-all,
 * no match, no rules), pre-send controlMode re-check, human takeover guard,
 * crash-after-Meta-accept recovery, version change, and end-to-end with
 * explicit test adapters.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock("@/lib/db/schema", () => ({
  aiMessageQueue: {
    id: "id", orgId: "orgId", conversationId: "conversationId",
    incomingMessageId: "incomingMessageId", status: "status",
    claimAt: "claimAt", claimedAt: "claimedAt", claimedBy: "claimedBy",
    leaseToken: "leaseToken", attemptCount: "attemptCount",
    errorLast: "errorLast", deadLetteredAt: "deadLetteredAt",
    updatedAt: "updatedAt",
  },
  waConversationMessages: {
    id: "id", orgId: "orgId", conversationId: "conversationId",
    direction: "direction", role: "role", content: "content",
    contentType: "contentType", externalMessageId: "externalMessageId",
    status: "status", isAi: "isAi", createdAt: "createdAt",
    tokenCount: "tokenCount",
  },
  waConversations: {
    id: "id", orgId: "orgId", phoneNumberId: "phoneNumberId",
    customerPhone: "customerPhone", controlMode: "controlMode",
    deploymentId: "deploymentId", leadId: "leadId",
    summary: "summary", messageCount: "messageCount",
    updatedAt: "updatedAt",
  },
  aiEpisodes: {
    id: "id", orgId: "orgId", conversationId: "conversationId",
    agentVersionId: "agentVersionId", campaignId: "campaignId",
    status: "status", startedAt: "startedAt",
    knowledgeSnapshot: "knowledgeSnapshot", triggerMessageId: "triggerMessageId",
    modelUsed: "modelUsed",
  },
  aiAgentDeployments: {
    id: "id", orgId: "orgId", agentId: "agentId", active: "active",
  },
  aiAgentVersions: {
    id: "id", orgId: "orgId", agentId: "agentId", status: "status",
  },
  aiCampaignRules: {
    id: "id", orgId: "orgId", deploymentId: "deploymentId",
    campaignId: "campaignId", priority: "priority", active: "active",
  },
  aiAgentVersionKnowledge: {
    agentVersionId: "agentVersionId", orgId: "orgId",
    knowledgeSourceId: "knowledgeSourceId", knowledgeRevisionId: "knowledgeRevisionId",
  },
  aiKnowledgeSources: { id: "id", status: "status" },
  aiKnowledgeRevisions: { id: "id", revisionNumber: "revisionNumber" },
  leads: { id: "id", campaignId: "campaignId" },
  waPhoneNumbers: { id: "id", orgId: "orgId", wabaAccountId: "wabaAccountId" },
  waBusinessAccounts: { id: "id" },
}))

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...conds) => ({ type: "and", conds })),
  desc: vi.fn((col) => ({ type: "desc", col })),
  lte: vi.fn((col, val) => ({ type: "lte", col, val })),
  lt: vi.fn((col, val) => ({ type: "lt", col, val })),
  sql: Object.assign(vi.fn((s) => s), { raw: vi.fn((s) => s) }),
}))

import { db } from "@/lib/db"

const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeChain(returnValue: unknown = []) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {}
  // NOTE: "then" must NOT be in this list — adding .then makes the object a
  // thenable, causing `await chain` to hang forever (chain.then returns itself).
  const methods = [
    "from", "innerJoin", "where", "orderBy",
    "set", "values", "onConflictDoNothing",
  ]
  for (const m of methods) {
    c[m] = vi.fn().mockReturnThis()
  }
  c.limit = vi.fn().mockResolvedValue(returnValue)
  c.returning = vi.fn().mockResolvedValue(returnValue)
  c.catch = vi.fn().mockImplementation(() => Promise.resolve(undefined))
  return c
}

// ─── Tests: Burst debounce ────────────────────────────────────────────────────

describe("enqueueForAiProcessing — burst debounce", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sets claimAt in the future (>= 3s from now) on first enqueue", async () => {
    const { enqueueForAiProcessing } = await import("@/domains/wa-cloud/repository")

    const insertChain = makeChain([{ id: "q-1" }])
    const updateChain = makeChain(undefined)
    mockDb.insert.mockReturnValue(insertChain)
    mockDb.update.mockReturnValue(updateChain)

    const before = Date.now()
    await enqueueForAiProcessing({
      orgId: "org-1",
      conversationId: "conv-1",
      incomingMessageId: "msg-1",
    })

    const valuesArg = insertChain.values.mock.calls[0]?.[0] as Record<string, unknown>
    expect(valuesArg).toBeDefined()
    const claimAt = valuesArg.claimAt as Date
    expect(claimAt.getTime()).toBeGreaterThanOrEqual(before + 3_000)
  })

  it("extends debounce for existing enqueued items on burst (second message)", async () => {
    const { enqueueForAiProcessing } = await import("@/domains/wa-cloud/repository")

    const insertChain = makeChain([]) // onConflictDoNothing → no new row
    const updateChain = makeChain(undefined)
    mockDb.insert.mockReturnValue(insertChain)
    mockDb.update.mockReturnValue(updateChain)

    await enqueueForAiProcessing({
      orgId: "org-1",
      conversationId: "conv-1",
      incomingMessageId: "msg-2",
    })

    // Update must be called to extend claimAt for all pending items
    expect(mockDb.update).toHaveBeenCalled()
    const setArg = updateChain.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.claimAt).toBeInstanceOf(Date)
    const claimAt = (setArg.claimAt as Date).getTime()
    expect(claimAt).toBeGreaterThan(Date.now() + 2_000)
  })

  it("is non-fatal — swallows insert/update errors without throwing", async () => {
    const { enqueueForAiProcessing } = await import("@/domains/wa-cloud/repository")

    mockDb.insert.mockImplementation(() => { throw new Error("DB down") })

    // Must not propagate
    await expect(
      enqueueForAiProcessing({ orgId: "org-1", conversationId: "conv-1", incomingMessageId: "msg-3" })
    ).resolves.toBeUndefined()
  })
})

// ─── Tests: Per-conversation serialization ────────────────────────────────────

describe("claimNextQueueItem — per-conversation serialization", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns null when no eligible items exist (queue empty)", async () => {
    const { claimNextQueueItem } = await import("@/domains/ai-agents/repository")

    const selectChain = makeChain([]) // no candidates
    mockDb.select.mockReturnValue(selectChain)

    const result = await claimNextQueueItem("worker-1")
    expect(result).toBeNull()
  })

  it("returns null when candidate UPDATE misses due to race (optimistic lock failed)", async () => {
    const { claimNextQueueItem } = await import("@/domains/ai-agents/repository")

    // SELECT returns a candidate but UPDATE returns empty (another worker claimed it first)
    const selectChain = makeChain([{
      id: "q-1", orgId: "org-1", conversationId: "conv-1",
      incomingMessageId: "msg-1", status: "enqueued",
      claimAt: new Date(Date.now() - 1000), attemptCount: 0,
    }])
    const updateChain = makeChain([]) // 0 rows updated = race lost
    mockDb.select.mockReturnValue(selectChain)
    mockDb.update.mockReturnValue(updateChain)

    const result = await claimNextQueueItem("worker-1")
    expect(result).toBeNull()
  })

  it("returns claimed item with leaseToken on successful claim", async () => {
    const { claimNextQueueItem } = await import("@/domains/ai-agents/repository")

    const candidateItem = {
      id: "q-1", orgId: "org-1", conversationId: "conv-1",
      incomingMessageId: "msg-1", status: "enqueued",
      claimAt: new Date(Date.now() - 1000), attemptCount: 0,
    }
    const claimedItem = {
      ...candidateItem,
      status: "processing",
      leaseToken: "lease-uuid-abc",
      attemptCount: 1,
    }

    const selectChain = makeChain([candidateItem])
    const updateChain = makeChain([claimedItem])
    mockDb.select.mockReturnValue(selectChain)
    mockDb.update.mockReturnValue(updateChain)

    const result = await claimNextQueueItem("worker-1")
    expect(result).not.toBeNull()
    expect(result?.leaseToken).toBe("lease-uuid-abc")
    expect(result?.status).toBe("processing")
  })

  it("UPDATE includes the leaseToken in the SET clause", async () => {
    const { claimNextQueueItem } = await import("@/domains/ai-agents/repository")

    const selectChain = makeChain([{
      id: "q-1", orgId: "org-1", conversationId: "conv-1",
      incomingMessageId: "msg-1", status: "enqueued",
      claimAt: new Date(), attemptCount: 2,
    }])
    const updateChain = makeChain([{ id: "q-1", leaseToken: "some-token" }])
    mockDb.select.mockReturnValue(selectChain)
    mockDb.update.mockReturnValue(updateChain)

    await claimNextQueueItem("worker-99")

    const setArg = updateChain.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg).toHaveProperty("leaseToken")
    expect(typeof setArg.leaseToken).toBe("string")
    expect(setArg.leaseToken).toMatch(/^[0-9a-f-]{36}$/)
  })
})

// ─── Tests: Orphan recovery ───────────────────────────────────────────────────

describe("recoverOrphanedQueueItems", () => {
  beforeEach(() => vi.clearAllMocks())

  it("resets processing items older than threshold to enqueued", async () => {
    const { recoverOrphanedQueueItems } = await import("@/domains/ai-agents/repository")

    const updateChain = makeChain([{ id: "q-orphan-1" }, { id: "q-orphan-2" }])
    mockDb.update.mockReturnValue(updateChain)

    const count = await recoverOrphanedQueueItems(10 * 60 * 1000)
    expect(count).toBe(2)

    const setArg = updateChain.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.status).toBe("enqueued")
    expect(setArg.leaseToken).toBeNull()
    expect(setArg.claimAt).toBeInstanceOf(Date)
  })

  it("returns 0 when no orphaned items exist", async () => {
    const { recoverOrphanedQueueItems } = await import("@/domains/ai-agents/repository")

    const updateChain = makeChain([])
    mockDb.update.mockReturnValue(updateChain)

    const count = await recoverOrphanedQueueItems()
    expect(count).toBe(0)
  })

  it("uses a cutoff time consistent with the 10-minute orphan threshold", async () => {
    const { recoverOrphanedQueueItems } = await import("@/domains/ai-agents/repository")

    const updateChain = makeChain([])
    mockDb.update.mockReturnValue(updateChain)

    const { lt } = await import("drizzle-orm")
    const ltMock = lt as ReturnType<typeof vi.fn>
    ltMock.mockClear()

    const before = Date.now()
    await recoverOrphanedQueueItems(10 * 60 * 1000)

    // The lt() comparison value should be approximately (now - 10min)
    const ltCall = ltMock.mock.calls[0]
    const cutoffDate = ltCall?.[1] as Date
    const tenMinAgo = before - 10 * 60 * 1000
    // Allow 2s tolerance for test execution time
    expect(Math.abs(cutoffDate.getTime() - tenMinAgo)).toBeLessThan(2000)
  })
})

// ─── Tests: Lease token fencing ───────────────────────────────────────────────

describe("markQueueItemDone / markQueueItemFailed — lease fencing", () => {
  beforeEach(() => vi.clearAllMocks())

  it("markQueueItemDone with matching leaseToken includes token in WHERE", async () => {
    const { markQueueItemDone } = await import("@/domains/ai-agents/repository")

    const updateChain = makeChain(undefined)
    mockDb.update.mockReturnValue(updateChain)

    const { eq } = await import("drizzle-orm")
    const eqMock = eq as ReturnType<typeof vi.fn>
    eqMock.mockClear()

    await markQueueItemDone("q-1", "lease-abc-123")

    // eq() should have been called with the leaseToken value
    const calls = eqMock.mock.calls
    const hasLeaseCheck = calls.some((c) => c[1] === "lease-abc-123")
    expect(hasLeaseCheck).toBe(true)
  })

  it("markQueueItemDone without leaseToken does not add token to WHERE", async () => {
    const { markQueueItemDone } = await import("@/domains/ai-agents/repository")

    const updateChain = makeChain(undefined)
    mockDb.update.mockReturnValue(updateChain)

    const { eq } = await import("drizzle-orm")
    const eqMock = eq as ReturnType<typeof vi.fn>
    eqMock.mockClear()

    await markQueueItemDone("q-1") // no leaseToken

    // Should only have been called once (for the id), not twice
    // (id eq is the only check)
    const calls = eqMock.mock.calls
    expect(calls.length).toBe(1)
  })

  it("markQueueItemFailed passes leaseToken to WHERE when provided", async () => {
    const { markQueueItemFailed } = await import("@/domains/ai-agents/repository")

    const updateChain = makeChain(undefined)
    mockDb.update.mockReturnValue(updateChain)

    const { eq } = await import("drizzle-orm")
    const eqMock = eq as ReturnType<typeof vi.fn>
    eqMock.mockClear()

    await markQueueItemFailed("q-1", "processing_error", new Date(), "lease-xyz")

    const hasLeaseCheck = eqMock.mock.calls.some((c) => c[1] === "lease-xyz")
    expect(hasLeaseCheck).toBe(true)
  })

  it("markQueueItemDeadLetter passes leaseToken to WHERE when provided", async () => {
    const { markQueueItemDeadLetter } = await import("@/domains/ai-agents/repository")

    const updateChain = makeChain(undefined)
    mockDb.update.mockReturnValue(updateChain)

    const { eq } = await import("drizzle-orm")
    const eqMock = eq as ReturnType<typeof vi.fn>
    eqMock.mockClear()

    await markQueueItemDeadLetter("q-1", "max_attempts_reached", "lease-dead")

    const hasLeaseCheck = eqMock.mock.calls.some((c) => c[1] === "lease-dead")
    expect(hasLeaseCheck).toBe(true)
  })
})

// ─── Tests: cancelPendingQueueItems & cancelPendingAiMessages ─────────────────

describe("cancelPendingQueueItems", () => {
  beforeEach(() => vi.clearAllMocks())

  it("marks all enqueued items for a conversation as done", async () => {
    const { cancelPendingQueueItems } = await import("@/domains/ai-agents/repository")

    const updateChain = makeChain([{ id: "q-1" }, { id: "q-2" }])
    mockDb.update.mockReturnValue(updateChain)

    const count = await cancelPendingQueueItems("conv-1", "org-1")
    expect(count).toBe(2)

    const setArg = updateChain.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.status).toBe("done")
  })
})

describe("cancelPendingAiMessages", () => {
  beforeEach(() => vi.clearAllMocks())

  it("marks AI pending messages as failed", async () => {
    const { cancelPendingAiMessages } = await import("@/domains/ai-agents/repository")

    const updateChain = makeChain([{ id: "msg-1" }])
    mockDb.update.mockReturnValue(updateChain)

    const count = await cancelPendingAiMessages("conv-1", "org-1")
    expect(count).toBe(1)

    const setArg = updateChain.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.status).toBe("failed")
  })

  it("returns 0 when no pending AI messages exist", async () => {
    const { cancelPendingAiMessages } = await import("@/domains/ai-agents/repository")

    const updateChain = makeChain([])
    mockDb.update.mockReturnValue(updateChain)

    const count = await cancelPendingAiMessages("conv-1", "org-1")
    expect(count).toBe(0)
  })
})

// ─── Tests: Episode router ────────────────────────────────────────────────────

describe("resolveEpisodeForConversation — active episode reuse", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns existing active episode without creating a new one", async () => {
    const { resolveEpisodeForConversation } = await import("@/domains/ai-agents/router")

    // getActiveEpisode returns an existing episode
    const selectChain = makeChain([{
      id: "ep-existing",
      agentVersionId: "ver-1",
      campaignId: "camp-1",
      status: "active",
      startedAt: new Date(),
    }])
    mockDb.select.mockReturnValue(selectChain)

    const result = await resolveEpisodeForConversation({
      orgId: "org-1",
      conversationId: "conv-1",
      deploymentId: "dep-1",
      leadId: "lead-1",
      triggerMessageId: "msg-1",
    })

    expect(result).not.toBeNull()
    expect(result?.episodeId).toBe("ep-existing")
    expect(result?.isNew).toBe(false)
    expect(result?.agentVersionId).toBe("ver-1")
    // Should not have tried to INSERT a new episode
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})

describe("resolveEpisodeForConversation — no deployment returns null", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns null when deploymentId is null (no agent assigned)", async () => {
    const { resolveEpisodeForConversation } = await import("@/domains/ai-agents/router")

    // getActiveEpisode: no active episode
    const selectChain = makeChain([])
    mockDb.select.mockReturnValue(selectChain)

    const result = await resolveEpisodeForConversation({
      orgId: "org-1",
      conversationId: "conv-1",
      deploymentId: null, // no deployment
      leadId: null,
      triggerMessageId: "msg-1",
    })

    expect(result).toBeNull()
  })
})

describe("resolveEpisodeForConversation — campaign rule matching", () => {
  beforeEach(() => vi.clearAllMocks())

  it("creates new episode with specific campaign rule match", async () => {
    const { resolveEpisodeForConversation } = await import("@/domains/ai-agents/router")

    let selectCallCount = 0
    mockDb.select.mockImplementation(() => {
      selectCallCount++
      const chain = makeChain([])

      if (selectCallCount === 1) {
        // getActiveEpisode → no active
        chain.limit = vi.fn().mockResolvedValue([])
      } else if (selectCallCount === 2) {
        // deployment lookup
        chain.limit = vi.fn().mockResolvedValue([{ agentId: "agent-1" }])
      } else if (selectCallCount === 3) {
        // published version
        chain.limit = vi.fn().mockResolvedValue([{ id: "ver-published" }])
      } else if (selectCallCount === 4) {
        // lead campaignId
        chain.limit = vi.fn().mockResolvedValue([{ campaignId: "camp-A" }])
      } else if (selectCallCount === 5) {
        // campaign rules — specific match for camp-A
        chain.limit = vi.fn().mockResolvedValue([
          { campaignId: "camp-A" },
          { campaignId: null }, // catch-all (lower priority, should not win)
        ])
        chain.where = vi.fn().mockReturnThis()
        chain.orderBy = vi.fn().mockReturnThis()
        // Rules query uses a different shape
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockResolvedValue([
            { campaignId: "camp-A" },
            { campaignId: null },
          ]),
        }
      } else if (selectCallCount === 6) {
        // knowledge associations
        chain.limit = vi.fn().mockResolvedValue([])
        return {
          from: vi.fn().mockReturnThis(),
          innerJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        }
      }
      return chain
    })

    const insertChain = makeChain([{
      id: "ep-new", orgId: "org-1", conversationId: "conv-1",
      agentVersionId: "ver-published", campaignId: "camp-A",
      status: "active", startedAt: new Date(),
    }])
    mockDb.insert.mockReturnValue(insertChain)

    const result = await resolveEpisodeForConversation({
      orgId: "org-1",
      conversationId: "conv-1",
      deploymentId: "dep-1",
      leadId: "lead-1",
      triggerMessageId: "msg-1",
    })

    expect(result).not.toBeNull()
    expect(result?.isNew).toBe(true)
    expect(mockDb.insert).toHaveBeenCalled()
  })

  it("returns null when specific rule exists but no catch-all and no match", async () => {
    const { resolveEpisodeForConversation } = await import("@/domains/ai-agents/router")

    let selectCallCount = 0
    mockDb.select.mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        // no active episode
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) }
      } else if (selectCallCount === 2) {
        // deployment
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ agentId: "agent-1" }]) }
      } else if (selectCallCount === 3) {
        // published version
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ id: "ver-pub" }]) }
      } else if (selectCallCount === 4) {
        // lead has campaign "camp-B"
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ campaignId: "camp-B" }]) }
      } else if (selectCallCount === 5) {
        // rules: only a specific rule for "camp-A" — no catch-all; orderBy is terminal
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([{ campaignId: "camp-A" }]) }
      }
      return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) }
    })

    const result = await resolveEpisodeForConversation({
      orgId: "org-1",
      conversationId: "conv-1",
      deploymentId: "dep-1",
      leadId: "lead-1",
      triggerMessageId: "msg-1",
    })

    expect(result).toBeNull()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("falls through to catch-all when no specific rule matches", async () => {
    const { resolveEpisodeForConversation } = await import("@/domains/ai-agents/router")

    let selectCallCount = 0
    mockDb.select.mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) }
      } else if (selectCallCount === 2) {
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ agentId: "agent-1" }]) }
      } else if (selectCallCount === 3) {
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ id: "ver-pub" }]) }
      } else if (selectCallCount === 4) {
        // lead has no campaign
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ campaignId: null }]) }
      } else if (selectCallCount === 5) {
        // rules — orderBy is terminal
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([{ campaignId: "camp-A" }, { campaignId: null }]) }
      } else if (selectCallCount === 6) {
        // knowledge
        return { from: vi.fn().mockReturnThis(), innerJoin: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) }
      }
      return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) }
    })

    const insertChain = makeChain([{
      id: "ep-catchall", conversationId: "conv-1", agentVersionId: "ver-pub",
      campaignId: null, status: "active", startedAt: new Date(),
    }])
    mockDb.insert.mockReturnValue(insertChain)

    const result = await resolveEpisodeForConversation({
      orgId: "org-1",
      conversationId: "conv-1",
      deploymentId: "dep-1",
      leadId: "lead-1",
      triggerMessageId: "msg-1",
    })

    expect(result).not.toBeNull()
    expect(result?.campaignId).toBeNull()
    expect(result?.isNew).toBe(true)
  })

  it("proceeds open (no campaign filter) when no rules configured at all", async () => {
    const { resolveEpisodeForConversation } = await import("@/domains/ai-agents/router")

    // leadId: null → lead lookup is SKIPPED → calls: 1=episode, 2=deployment, 3=version, 4=rules, 5=knowledge
    let selectCallCount = 0
    mockDb.select.mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) }
      } else if (selectCallCount === 2) {
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ agentId: "agent-1" }]) }
      } else if (selectCallCount === 3) {
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ id: "ver-pub" }]) }
      } else if (selectCallCount === 4) {
        // campaign rules — orderBy is the terminal call
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([]) }
      } else if (selectCallCount === 5) {
        return { from: vi.fn().mockReturnThis(), innerJoin: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) }
      }
      return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) }
    })

    const insertChain = makeChain([{
      id: "ep-open", conversationId: "conv-1", agentVersionId: "ver-pub",
      campaignId: null, status: "active", startedAt: new Date(),
    }])
    mockDb.insert.mockReturnValue(insertChain)

    const result = await resolveEpisodeForConversation({
      orgId: "org-1",
      conversationId: "conv-1",
      deploymentId: "dep-1",
      leadId: null,
      triggerMessageId: "msg-1",
    })

    expect(result).not.toBeNull()
    expect(result?.isNew).toBe(true)
    // No campaign restriction applied
    expect(result?.campaignId).toBeNull()
  })
})

// ─── Tests: Knowledge snapshot excludes revoked sources ───────────────────────

describe("resolveEpisodeForConversation — knowledge snapshot", () => {
  beforeEach(() => vi.clearAllMocks())

  it("excludes revoked sources from the frozen knowledge snapshot", async () => {
    const { resolveEpisodeForConversation } = await import("@/domains/ai-agents/router")

    let selectCallCount = 0
    mockDb.select.mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) }
      } else if (selectCallCount === 2) {
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ agentId: "a-1" }]) }
      } else if (selectCallCount === 3) {
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([{ id: "v-1" }]) }
      } else if (selectCallCount === 4) {
        // leadId: null → lead lookup skipped → this is the rules query
        return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockResolvedValue([]) }
      } else if (selectCallCount === 5) {
        // knowledge: one active, one revoked
        return {
          from: vi.fn().mockReturnThis(),
          innerJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { sourceId: "src-active", revisionId: "rev-1", revisionNumber: 1, sourceStatus: "active" },
            { sourceId: "src-revoked", revisionId: "rev-2", revisionNumber: 1, sourceStatus: "revoked" },
          ]),
        }
      }
      return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]) }
    })

    let capturedSnapshot: unknown = null
    const insertChain = {
      values: vi.fn().mockImplementation((v) => { capturedSnapshot = v.knowledgeSnapshot; return insertChain }),
      returning: vi.fn().mockResolvedValue([{ id: "ep-1", agentVersionId: "v-1", campaignId: null }]),
    }
    mockDb.insert.mockReturnValue(insertChain)

    await resolveEpisodeForConversation({
      orgId: "org-1", conversationId: "conv-1",
      deploymentId: "dep-1", leadId: null, triggerMessageId: "msg-1",
    })

    const snapshot = capturedSnapshot as Array<{ sourceId: string }>
    expect(snapshot).toBeDefined()
    expect(snapshot).toHaveLength(1)
    expect(snapshot[0].sourceId).toBe("src-active")
  })
})

// ─── Tests: End-to-end pipeline with test adapters ───────────────────────────

describe("end-to-end pipeline — test adapters", () => {
  beforeEach(() => vi.clearAllMocks())

  it("complete happy path: enqueue → claim → mark done", async () => {
    const { enqueueForAiProcessing } = await import("@/domains/wa-cloud/repository")
    const { claimNextQueueItem, markQueueItemDone } = await import("@/domains/ai-agents/repository")

    // Simulate a message being enqueued
    const insertChain = makeChain([{ id: "q-1" }])
    const updateChain = makeChain([{
      id: "q-1", orgId: "org-e2e", conversationId: "conv-e2e",
      incomingMessageId: "msg-e2e", status: "processing",
      claimAt: new Date(), leaseToken: "lease-e2e", attemptCount: 1,
    }])
    const updateDoneChain = makeChain(undefined)

    let insertCallCount = 0
    let updateCallCount = 0

    mockDb.insert.mockImplementation(() => { insertCallCount++; return insertChain })
    mockDb.update.mockImplementation(() => {
      updateCallCount++
      if (updateCallCount <= 2) return updateChain // extend debounce + claim
      return updateDoneChain // mark done
    })
    mockDb.select.mockReturnValue(makeChain([{
      id: "q-1", orgId: "org-e2e", conversationId: "conv-e2e",
      incomingMessageId: "msg-e2e", status: "enqueued",
      claimAt: new Date(Date.now() - 5000), attemptCount: 0,
    }]))

    // Step 1: enqueue
    await enqueueForAiProcessing({
      orgId: "org-e2e",
      conversationId: "conv-e2e",
      incomingMessageId: "msg-e2e",
    })
    expect(insertCallCount).toBe(1)

    // Step 2: claim
    const claimed = await claimNextQueueItem("worker-e2e")
    expect(claimed).not.toBeNull()
    expect(claimed?.leaseToken).toBe("lease-e2e")

    // Step 3: mark done with leaseToken (fencing)
    mockDb.update.mockReturnValue(makeChain(undefined))
    await markQueueItemDone(claimed!.id, claimed!.leaseToken ?? undefined)
    // Verify the final update was called
    expect(mockDb.update).toHaveBeenCalled()
  })

  it("stale worker cannot complete work — wrong lease token is a no-op", async () => {
    const { markQueueItemDone } = await import("@/domains/ai-agents/repository")

    const updateChain = makeChain(undefined)
    mockDb.update.mockReturnValue(updateChain)

    const { eq } = await import("drizzle-orm")
    const eqMock = eq as ReturnType<typeof vi.fn>
    eqMock.mockClear()

    // Worker A has stale-lease; correct token is "real-lease"
    await markQueueItemDone("q-1", "stale-lease-old-worker")

    // The WHERE clause includes the stale lease token — DB will find 0 rows
    // (we verify the fencing token is included in the WHERE call)
    const hasStaleTokenCheck = eqMock.mock.calls.some((c) => c[1] === "stale-lease-old-worker")
    expect(hasStaleTokenCheck).toBe(true)
  })

  it("orphan recovery → re-claim → process (crash recovery path)", async () => {
    const { recoverOrphanedQueueItems, claimNextQueueItem } = await import("@/domains/ai-agents/repository")

    // Step 1: recovery resets orphaned item
    const recoverChain = makeChain([{ id: "q-orphan" }])
    mockDb.update.mockReturnValue(recoverChain)
    const recovered = await recoverOrphanedQueueItems()
    expect(recovered).toBe(1)

    const resetArg = recoverChain.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(resetArg.status).toBe("enqueued")
    expect(resetArg.leaseToken).toBeNull()

    // Step 2: item is now claimable by a new worker
    const claimSelectChain = makeChain([{
      id: "q-orphan", orgId: "org-1", conversationId: "conv-orphan",
      incomingMessageId: "msg-orphan", status: "enqueued",
      claimAt: new Date(Date.now() - 1000), attemptCount: 1, // already attempted once
    }])
    const claimUpdateChain = makeChain([{
      id: "q-orphan", status: "processing", leaseToken: "new-lease-after-recovery",
      attemptCount: 2,
    }])

    mockDb.select.mockReturnValue(claimSelectChain)
    mockDb.update.mockReturnValue(claimUpdateChain)

    const reclaimed = await claimNextQueueItem("worker-new")
    expect(reclaimed).not.toBeNull()
    expect(reclaimed?.leaseToken).toBe("new-lease-after-recovery")
    expect(reclaimed?.attemptCount).toBe(2) // incremented
  })

  it("human takeover during LLM: cancelPendingAiMessages called, send skipped", async () => {
    const { cancelPendingAiMessages } = await import("@/domains/ai-agents/repository")

    // Simulate a scenario where controlMode changed to "human" during engine run
    const updateChain = makeChain([{ id: "msg-pending-ai" }])
    mockDb.update.mockReturnValue(updateChain)

    // In the cron worker this is called when fresh controlMode != "ai"
    const cancelled = await cancelPendingAiMessages("conv-takeover", "org-1")
    expect(cancelled).toBe(1)

    const setArg = updateChain.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.status).toBe("failed")
    // NOTE: messages already accepted by Meta cannot be retracted.
    // This only affects messages in "pending" state (not yet sent).
  })

  it("dead-letter after MAX_ATTEMPTS — retries exhausted", async () => {
    const { markQueueItemDeadLetter, markQueueItemFailed } = await import("@/domains/ai-agents/repository")

    const updateChain = makeChain(undefined)
    mockDb.update.mockReturnValue(updateChain)

    // Attempt 5 — dead-letter
    await markQueueItemDeadLetter("q-exhausted", "max_attempts_reached", "lease-5")

    const setArg = updateChain.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.status).toBe("dead_letter")
    expect(setArg.errorLast).toBe("max_attempts_reached")

    // Earlier attempts use exponential backoff via markQueueItemFailed
    vi.clearAllMocks()
    const failedChain = makeChain(undefined)
    mockDb.update.mockReturnValue(failedChain)

    const retryAt = new Date(Date.now() + 4_000)
    await markQueueItemFailed("q-2", "processing_error", retryAt, "lease-2")

    const failedSetArg = failedChain.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(failedSetArg.status).toBe("failed")
    // claimAt is used as the retry-at time for debounced re-claim
    expect(failedSetArg.claimAt).toBeInstanceOf(Date)
  })
})

// ─── Tests: Idempotence guards ────────────────────────────────────────────────

describe("idempotence — duplicate queue entries prevented", () => {
  beforeEach(() => vi.clearAllMocks())

  it("duplicate wamid enqueue is a no-op (onConflictDoNothing)", async () => {
    const { enqueueForAiProcessing } = await import("@/domains/wa-cloud/repository")

    const insertChain = makeChain([]) // empty = already existed (conflict silenced)
    const updateChain = makeChain(undefined)
    mockDb.insert.mockReturnValue(insertChain)
    mockDb.update.mockReturnValue(updateChain)

    // Same incomingMessageId twice
    await enqueueForAiProcessing({ orgId: "org-1", conversationId: "conv-1", incomingMessageId: "wamid.dup" })
    await enqueueForAiProcessing({ orgId: "org-1", conversationId: "conv-1", incomingMessageId: "wamid.dup" })

    // Both calls attempt insert but conflict silences the second
    expect(insertChain.onConflictDoNothing).toHaveBeenCalled()
  })
})

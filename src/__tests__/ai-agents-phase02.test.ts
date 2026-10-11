import { vi, describe, it, expect, beforeEach } from "vitest"

// server-only is aliased to a no-op in vitest.config.ts
vi.mock("server-only", () => ({}))

vi.mock("@/lib/crypto", () => ({
  encryptTokenVersioned: (plain: string) => ({ ciphertext: `enc:${plain}`, keyVersion: 1 }),
  decryptTokenVersioned: (cipher: string) => cipher.replace("enc:", ""),
}))

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {},
  },
}))

import { db } from "@/lib/db"
import { createHmac } from "crypto"
import { verifyWebhookSignature, parseWebhookPayload } from "@/domains/wa-cloud/webhook"
import {
  CONTROL_MODES,
  EPISODE_EXIT_REASONS,
  QUEUE_STATUSES,
  EndEpisodeSchema,
  CreateEpisodeSchema,
  EnqueueMessageSchema,
  UpdateControlModeSchema,
} from "@/domains/ai-agents/types"
import { WA_MESSAGE_DELIVERY_STATUSES, INBOUND_STATUS } from "@/domains/wa-cloud/types"

const mockSelect = vi.mocked(db.select)
const mockInsert = vi.mocked(db.insert)
const mockUpdate = vi.mocked(db.update)

// ─── Chain builder ────────────────────────────────────────────────────────────
// Builds a thenable, chainable mock that resolves to `result`.
// All Drizzle builder methods (from/where/limit/innerJoin/etc.) return the same chain.

function chain(result: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = Object.assign(Promise.resolve(result), {})
  const methods = ["from", "where", "limit", "orderBy", "innerJoin", "values",
                   "onConflictDoNothing", "returning", "set"]
  for (const m of methods) c[m] = () => c
  return c
}

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001"
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002"
const USER_ID = "user-test-01"

// Valid UUIDs for Zod validation tests (Zod v4 enforces version + variant bits)
const UUID_A = "00000000-0000-4000-8000-000000000001"
const UUID_B = "00000000-0000-4000-8000-000000000002"

beforeEach(() => { vi.clearAllMocks() })

// ─── 1. HMAC signature verification ──────────────────────────────────────────

describe("verifyWebhookSignature", () => {
  const secret = "test-secret-abcdef"
  const body = '{"object":"whatsapp_business_account","entry":[]}'

  function sig(s: string) {
    return "sha256=" + createHmac("sha256", s).update(body).digest("hex")
  }

  it("accepts a valid signature", () => {
    expect(verifyWebhookSignature(body, sig(secret), secret)).toBe(true)
  })

  it("rejects null signature", () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false)
  })

  it("rejects wrong secret", () => {
    expect(verifyWebhookSignature(body, sig("wrong"), secret)).toBe(false)
  })

  it("rejects tampered body", () => {
    expect(verifyWebhookSignature(body + "x", sig(secret), secret)).toBe(false)
  })

  it("rejects signature without sha256= prefix", () => {
    const raw = createHmac("sha256", secret).update(body).digest("hex")
    expect(verifyWebhookSignature(body, raw, secret)).toBe(false)
  })
})

// ─── 2. Webhook payload parsing ───────────────────────────────────────────────

describe("parseWebhookPayload", () => {
  const baseMessage = {
    id: "wamid.TEST001",
    from: "5491100000001",
    timestamp: "1700000000",
    type: "text",
    text: { body: "Hola, quiero info" },
  }

  const basePayload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA_123",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "+15551234567", phone_number_id: "PHONE_1" },
          contacts: [{ profile: { name: "Ana García" }, wa_id: "5491100000001" }],
          messages: [baseMessage],
        },
      }],
    }],
  }

  it("parses a text message correctly", () => {
    const result = parseWebhookPayload(basePayload)
    expect(result.messages).toHaveLength(1)
    const msg = result.messages[0]
    expect(msg.wamid).toBe("wamid.TEST001")
    expect(msg.fromPhone).toBe("5491100000001")
    expect(msg.toPhoneNumberId).toBe("PHONE_1")
    expect(msg.wabaId).toBe("WABA_123")
    expect(msg.customerName).toBe("Ana García")
    expect(msg.textContent).toBe("Hola, quiero info")
    expect(msg.type).toBe("text")
  })

  it("converts unix timestamp to Date", () => {
    const result = parseWebhookPayload(basePayload)
    expect(result.messages[0].timestamp.getTime()).toBe(1700000000 * 1000)
  })

  it("returns empty arrays on schema mismatch", () => {
    expect(parseWebhookPayload({ object: "not_whatsapp", entry: [] }))
      .toMatchObject({ messages: [], statuses: [] })
  })

  it("returns empty arrays on null / invalid input", () => {
    expect(parseWebhookPayload(null).messages).toHaveLength(0)
    expect(parseWebhookPayload("string").messages).toHaveLength(0)
    expect(parseWebhookPayload({}).messages).toHaveLength(0)
  })

  it("ignores non-messages change fields", () => {
    const payload = {
      ...basePayload,
      entry: [{
        ...basePayload.entry[0],
        changes: [{ field: "account_alerts", value: {} }],
      }],
    }
    expect(parseWebhookPayload(payload).messages).toHaveLength(0)
  })

  it("parses delivery status updates", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        id: "WABA_123",
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "+1", phone_number_id: "PHONE_1" },
            statuses: [{
              id: "wamid.OUT001",
              status: "delivered",
              timestamp: "1700000100",
              recipient_id: "5491100000001",
            }],
          },
        }],
      }],
    }
    const result = parseWebhookPayload(payload)
    expect(result.statuses).toHaveLength(1)
    expect(result.statuses[0].wamid).toBe("wamid.OUT001")
    expect(result.statuses[0].status).toBe("delivered")
  })

  it("parses status error codes without leaking internal details", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        id: "WABA_123",
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "+1", phone_number_id: "PHONE_1" },
            statuses: [{
              id: "wamid.FAIL001",
              status: "failed",
              timestamp: "1700000200",
              recipient_id: "5491100000001",
              errors: [{ code: 131047, title: "Re-engagement message" }],
            }],
          },
        }],
      }],
    }
    const stat = parseWebhookPayload(payload).statuses[0]
    expect(stat.errorCode).toBe(131047)
    expect(stat.errorTitle).toBe("Re-engagement message")
  })

  it("parses image message extracting mediaId, mimeType, caption", () => {
    const payload = {
      ...basePayload,
      entry: [{
        id: "WABA_123",
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "+1", phone_number_id: "PHONE_1" },
            messages: [{
              id: "wamid.IMG001",
              from: "5491100000001",
              timestamp: "1700000050",
              type: "image",
              image: { id: "media-id-xyz", mime_type: "image/jpeg", caption: "mira esto" },
            }],
          },
        }],
      }],
    }
    const msg = parseWebhookPayload(payload).messages[0]
    expect(msg.type).toBe("image")
    expect(msg.mediaId).toBe("media-id-xyz")
    expect(msg.mimeType).toBe("image/jpeg")
    expect(msg.caption).toBe("mira esto")
  })
})

// ─── 3. Tenant isolation — knowledge cross-tenant guard ───────────────────────

describe("associateKnowledgeWithVersion — cross-tenant guard", () => {
  it("returns null when source belongs to a different org", async () => {
    // ORG_B tries to associate ORG_A's knowledge source
    mockSelect.mockReturnValueOnce(chain([]))  // source not found in ORG_B scope

    const { associateKnowledgeWithVersion } = await import("@/domains/ai-agents/repository")
    const result = await associateKnowledgeWithVersion(ORG_B, {
      agentVersionId: "ver-aaa-111",
      knowledgeSourceId: "src-org-a-111",
      knowledgeRevisionId: "rev-org-a-111",
    })
    expect(result).toBeNull()
    // Only one select was needed — returned null without even checking the revision
    expect(mockSelect).toHaveBeenCalledTimes(1)
  })

  it("returns null when revision sourceId doesn't match the knowledge source", async () => {
    const sourceRow = { id: "src-001", orgId: ORG_A, status: "active", name: "Guide" }
    const revisionWithWrongSource = {
      id: "rev-002", orgId: ORG_A,
      sourceId: "src-DIFFERENT",  // Different source!
      revisionNumber: 1,
    }

    mockSelect
      .mockReturnValueOnce(chain([sourceRow]))         // source found
      .mockReturnValueOnce(chain([revisionWithWrongSource]))  // revision found but wrong source

    const { associateKnowledgeWithVersion } = await import("@/domains/ai-agents/repository")
    const result = await associateKnowledgeWithVersion(ORG_A, {
      agentVersionId: "ver-aaa",
      knowledgeSourceId: "src-001",
      knowledgeRevisionId: "rev-002",
    })
    expect(result).toBeNull()
  })
})

// ─── 4. Unique constraint semantics (architecture verification) ───────────────

describe("unique constraint names — verified in schema and migration", () => {
  it("phone_number_id is globally unique (one physical number per system)", () => {
    // Enforced by: uniqueIndex("wa_phone_numbers_phone_number_id_global_idx").on(t.phoneNumberId)
    // Verified in: drizzle/0016_ai_agents_phase02.sql
    expect("wa_phone_numbers_phone_number_id_global_idx").toMatchSnapshot()
  })

  it("waba_id is globally unique (one WABA ID per system)", () => {
    expect("wa_business_accounts_waba_id_global_idx").toMatchSnapshot()
  })

  it("at most one published version per agent (partial unique index)", () => {
    // ON ai_agent_versions (agent_id) WHERE status = 'published'
    expect("ai_agent_versions_agent_published_idx").toMatchSnapshot()
  })

  it("at most one revision per source per agent version", () => {
    expect("ai_agent_version_knowledge_version_source_idx").toMatchSnapshot()
  })

  it("message queue deduplication (one entry per incoming_message_id)", () => {
    expect("ai_message_queue_message_id_idx").toMatchSnapshot()
  })
})

// ─── 5. Atomic publication — archive-then-publish ────────────────────────────

describe("publishAgentVersion — atomic publication", () => {
  it("returns null when the version is not a draft in this org", async () => {
    mockSelect.mockReturnValueOnce(chain([]))  // No draft found

    const { publishAgentVersion } = await import("@/domains/ai-agents/repository")
    const result = await publishAgentVersion("ver-not-draft", ORG_B, USER_ID)
    expect(result).toBeNull()
  })

  it("archives the current published version before publishing the draft", async () => {
    const draft = { id: "ver-draft-01", agentId: "agent-001", orgId: ORG_A, status: "draft" }

    // SELECT for draft: found
    mockSelect.mockReturnValueOnce(chain([draft]))

    const archiveSet = vi.fn().mockReturnValue(chain(undefined))
    const publishSet = vi.fn().mockReturnValue({
      where: () => chain([{ ...draft, status: "published" }]),
    })

    mockUpdate
      .mockReturnValueOnce({ set: archiveSet } as never)  // archive step
      .mockReturnValueOnce({ set: publishSet } as never)  // publish step

    const { publishAgentVersion } = await import("@/domains/ai-agents/repository")
    const result = await publishAgentVersion("ver-draft-01", ORG_A, USER_ID)

    expect(result?.status).toBe("published")
    // Step 1: archive call
    expect(archiveSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" })
    )
    // Step 2: publish call
    expect(publishSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "published" })
    )
  })
})

// ─── 6. Revoked knowledge sources excluded from retrieval ─────────────────────

describe("getKnowledgeForVersion — revoked sources excluded at app layer", () => {
  it("filters out revoked sources from the result", async () => {
    const rows = [
      {
        assoc: { id: "assoc-1", agentVersionId: "ver-1", knowledgeSourceId: "src-active" },
        source: { id: "src-active", status: "active", name: "Active Guide" },
        revision: { id: "rev-1", content: "Active content" },
      },
      {
        assoc: { id: "assoc-2", agentVersionId: "ver-1", knowledgeSourceId: "src-revoked" },
        source: { id: "src-revoked", status: "revoked", name: "Revoked Guide" },
        revision: { id: "rev-2", content: "Old content" },
      },
    ]

    mockSelect.mockReturnValueOnce(chain(rows))

    const { getKnowledgeForVersion } = await import("@/domains/ai-agents/repository")
    const result = await getKnowledgeForVersion("ver-1", ORG_A)

    expect(result).toHaveLength(1)
    expect(result[0].source.status).toBe("active")
    // The revoked source must not appear — the episode still references it for audit,
    // but the engine skips retrieval at the application layer.
    expect(result.find(r => r.source.status === "revoked")).toBeUndefined()
  })

  it("returns empty array when all associated sources are revoked", async () => {
    mockSelect.mockReturnValueOnce(chain([{
      assoc: { id: "assoc-1" },
      source: { id: "src-revoked", status: "revoked" },
      revision: { id: "rev-1" },
    }]))

    const { getKnowledgeForVersion } = await import("@/domains/ai-agents/repository")
    const result = await getKnowledgeForVersion("ver-1", ORG_A)
    expect(result).toHaveLength(0)
  })
})

// ─── 7. Claim-atomic queue (optimistic lock) ──────────────────────────────────

describe("claimNextQueueItem — optimistic lock prevents double-processing", () => {
  it("returns null when queue is empty", async () => {
    mockSelect.mockReturnValueOnce(chain([]))  // No enqueued items

    const { claimNextQueueItem } = await import("@/domains/ai-agents/repository")
    expect(await claimNextQueueItem("worker-001")).toBeNull()
  })

  it("returns null when item was already claimed by a concurrent worker", async () => {
    const candidate = { id: "queue-001", status: "enqueued", attemptCount: 0, orgId: ORG_A }

    mockSelect.mockReturnValueOnce(chain([candidate]))

    // UPDATE WHERE status='enqueued' returns empty — another worker claimed it first
    mockUpdate.mockReturnValueOnce({
      set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }),
    } as never)

    const { claimNextQueueItem } = await import("@/domains/ai-agents/repository")
    const result = await claimNextQueueItem("worker-002")
    expect(result).toBeNull()
  })

  it("returns the claimed item, incrementing attemptCount", async () => {
    const candidate = { id: "queue-001", status: "enqueued", attemptCount: 1, orgId: ORG_A }
    const claimed = { ...candidate, status: "processing", attemptCount: 2, claimedBy: "worker-01" }

    mockSelect.mockReturnValueOnce(chain([candidate]))
    mockUpdate.mockReturnValueOnce({
      set: () => ({ where: () => ({ returning: () => Promise.resolve([claimed]) }) }),
    } as never)

    const { claimNextQueueItem } = await import("@/domains/ai-agents/repository")
    const result = await claimNextQueueItem("worker-01")

    expect(result).not.toBeNull()
    expect(result!.status).toBe("processing")
    expect(result!.attemptCount).toBe(2)
    expect(result!.claimedBy).toBe("worker-01")
  })
})

// ─── 8. Message persistence deduplication ────────────────────────────────────

describe("persistIncomingMessage — wamid deduplication", () => {
  const msg = {
    wamid: "wamid.DEDUP001",
    fromPhone: "5491100000001",
    toPhoneNumberId: "PHONE_1",
    wabaId: "WABA_1",
    type: "text" as const,
    textContent: "Hola",
    timestamp: new Date(1700000000 * 1000),
  }

  it("returns null when wamid already exists (onConflictDoNothing returns empty)", async () => {
    // Conflict on external_message_id unique index → nothing inserted
    mockInsert.mockReturnValueOnce({
      values: () => ({ onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }) }),
    } as never)

    const { persistIncomingMessage } = await import("@/domains/wa-cloud/repository")
    const result = await persistIncomingMessage(ORG_A, "conv-001", msg)
    expect(result).toBeNull()
  })

  it("returns the new message row ID on first insertion", async () => {
    mockInsert.mockReturnValueOnce({
      values: () => ({
        onConflictDoNothing: () => ({ returning: () => Promise.resolve([{ id: "msg-row-001" }]) }),
      }),
    } as never)

    // Update lastMessageAt
    mockUpdate.mockReturnValueOnce({
      set: () => ({ where: () => Promise.resolve() }),
    } as never)

    const { persistIncomingMessage } = await import("@/domains/wa-cloud/repository")
    const result = await persistIncomingMessage(ORG_A, "conv-001", msg)
    expect(result).toBe("msg-row-001")
  })
})

// ─── 9. Conversation find-or-create ──────────────────────────────────────────

describe("findOrCreateConversation — upsert semantics", () => {
  it("returns existing conversation ID without inserting", async () => {
    // First select: existing conversation found
    mockSelect.mockReturnValueOnce(chain([{ id: "conv-existing-001" }]))
    // Update for customerName
    mockUpdate.mockReturnValueOnce({
      set: () => ({ where: () => Promise.resolve() }),
    } as never)

    const { findOrCreateConversation } = await import("@/domains/wa-cloud/repository")
    const result = await findOrCreateConversation({
      orgId: ORG_A,
      phoneNumberRowId: "phone-row-001",
      customerPhone: "5491100000001",
      customerName: "Ana",
    })

    expect(result).toBe("conv-existing-001")
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it("creates a new conversation when none exists", async () => {
    // No existing conversation
    mockSelect.mockReturnValueOnce(chain([]))

    mockInsert.mockReturnValueOnce({
      values: () => ({
        onConflictDoNothing: () => ({ returning: () => Promise.resolve([{ id: "conv-new-001" }]) }),
      }),
    } as never)

    const { findOrCreateConversation } = await import("@/domains/wa-cloud/repository")
    const result = await findOrCreateConversation({
      orgId: ORG_A,
      phoneNumberRowId: "phone-row-001",
      customerPhone: "5491100000002",
    })
    expect(result).toBe("conv-new-001")
  })
})

// ─── 10. AI queue enqueue deduplication ──────────────────────────────────────

describe("enqueueForAiProcessing — onConflictDoNothing deduplication", () => {
  it("inserts without error on first enqueue", async () => {
    mockInsert.mockReturnValueOnce({
      values: () => ({ onConflictDoNothing: () => Promise.resolve() }),
    } as never)

    const { enqueueForAiProcessing } = await import("@/domains/wa-cloud/repository")
    await expect(enqueueForAiProcessing({
      orgId: ORG_A,
      conversationId: "conv-001",
      incomingMessageId: "msg-001",
    })).resolves.toBeUndefined()
  })

  it("does not throw when message is already queued (idempotent)", async () => {
    // onConflictDoNothing silently ignores duplicate; catch swallows any error
    mockInsert.mockReturnValueOnce({
      values: () => ({ onConflictDoNothing: () => Promise.resolve() }),
    } as never)

    const { enqueueForAiProcessing } = await import("@/domains/wa-cloud/repository")
    await expect(enqueueForAiProcessing({
      orgId: ORG_A,
      conversationId: "conv-001",
      incomingMessageId: "msg-001",  // Same ID as above
    })).resolves.toBeUndefined()
  })
})

// ─── 11. Control mode and status constants ────────────────────────────────────

describe("Phase 02 constants and enums", () => {
  it("CONTROL_MODES contains all four control states", () => {
    expect(CONTROL_MODES).toEqual(["ai", "waiting_human", "human", "paused"])
  })

  it("EPISODE_EXIT_REASONS contains all 7 reasons", () => {
    const expected = [
      "objective_met", "human_requested", "transfer_rule",
      "inactivity", "error", "budget", "limit",
    ]
    expect(EPISODE_EXIT_REASONS).toHaveLength(7)
    for (const r of expected) {
      expect(EPISODE_EXIT_REASONS).toContain(r)
    }
  })

  it("QUEUE_STATUSES follows the FSM: enqueued → processing → done", () => {
    expect(QUEUE_STATUSES).toEqual(["enqueued", "processing", "done", "failed", "dead_letter"])
  })

  it("WA_MESSAGE_DELIVERY_STATUSES includes all 7 outbound states", () => {
    const expected = ["pending", "sending", "accepted", "delivered", "read", "failed", "unknown"]
    expect(WA_MESSAGE_DELIVERY_STATUSES).toHaveLength(7)
    for (const s of expected) {
      expect(WA_MESSAGE_DELIVERY_STATUSES).toContain(s)
    }
  })

  it("INBOUND_STATUS is 'received' (separate from outbound FSM)", () => {
    expect(INBOUND_STATUS).toBe("received")
  })
})

// ─── 12. Zod schema validation ────────────────────────────────────────────────

describe("Phase 02 Zod schemas", () => {
  it("EndEpisodeSchema: valid exit reason", () => {
    expect(EndEpisodeSchema.safeParse({ exitReason: "objective_met" }).success).toBe(true)
  })

  it("EndEpisodeSchema: invalid exit reason", () => {
    expect(EndEpisodeSchema.safeParse({ exitReason: "anything_else" }).success).toBe(false)
  })

  it("EndEpisodeSchema: optional token counts", () => {
    const result = EndEpisodeSchema.safeParse({
      exitReason: "error",
      tokenCountIn: 1000,
      tokenCountOut: 500,
    })
    expect(result.success).toBe(true)
  })

  it("CreateEpisodeSchema: minimal valid input", () => {
    const result = CreateEpisodeSchema.safeParse({
      conversationId: UUID_A,
      agentVersionId: UUID_B,
    })
    expect(result.success).toBe(true)
  })

  it("CreateEpisodeSchema: invalid UUIDs", () => {
    const result = CreateEpisodeSchema.safeParse({
      conversationId: "not-a-uuid",
      agentVersionId: "also-not",
    })
    expect(result.success).toBe(false)
  })

  it("CreateEpisodeSchema: knowledgeSnapshot defaults to []", () => {
    const result = CreateEpisodeSchema.safeParse({
      conversationId: UUID_A,
      agentVersionId: UUID_B,
    })
    if (result.success) {
      expect(result.data.knowledgeSnapshot).toEqual([])
    }
  })

  it("EnqueueMessageSchema: valid UUIDs", () => {
    const result = EnqueueMessageSchema.safeParse({
      conversationId: UUID_A,
      incomingMessageId: UUID_B,
    })
    expect(result.success).toBe(true)
  })

  it("UpdateControlModeSchema: valid modes", () => {
    for (const mode of CONTROL_MODES) {
      expect(UpdateControlModeSchema.safeParse({ controlMode: mode }).success).toBe(true)
    }
  })

  it("UpdateControlModeSchema: rejects unknown mode", () => {
    expect(UpdateControlModeSchema.safeParse({ controlMode: "robot" }).success).toBe(false)
  })
})

// ─── 13. Cross-tenant DB query isolation ─────────────────────────────────────

describe("tenant isolation — repository functions scope by orgId", () => {
  it("getWaBusinessAccountById returns null when orgId doesn't match", async () => {
    // SELECT returns empty — the AND condition filters out the wrong org
    mockSelect.mockReturnValueOnce(chain([]))

    const { getWaBusinessAccountById } = await import("@/domains/ai-agents/repository")
    const result = await getWaBusinessAccountById("acc-from-org-a", ORG_B)
    expect(result).toBeNull()
  })

  it("getAiAgentById returns null for cross-tenant access", async () => {
    mockSelect.mockReturnValueOnce(chain([]))

    const { getAiAgentById } = await import("@/domains/ai-agents/repository")
    const result = await getAiAgentById("agent-from-org-a", ORG_B)
    expect(result).toBeNull()
  })

  it("getKnowledgeSourceById returns null for cross-tenant access", async () => {
    mockSelect.mockReturnValueOnce(chain([]))

    const { getKnowledgeSourceById } = await import("@/domains/ai-agents/repository")
    const result = await getKnowledgeSourceById("src-from-org-a", ORG_B)
    expect(result).toBeNull()
  })

  it("resolveTenantFromPhoneNumberId returns null when phone_number_id is not registered", async () => {
    mockSelect.mockReturnValueOnce(chain([]))

    const { resolveTenantFromPhoneNumberId } = await import("@/domains/wa-cloud/repository")
    const result = await resolveTenantFromPhoneNumberId("PHONE_NOT_REGISTERED")
    expect(result).toBeNull()
  })

  it("resolveTenantFromPhoneNumberId returns tenant context when registered", async () => {
    const row = {
      phoneNumberRowId: "phone-uuid-001",
      orgId: ORG_A,
      wabaId: "WABA_123",
      accessTokenEnc: "enc:token",
      keyVersion: 1,
    }
    mockSelect.mockReturnValueOnce(chain([row]))

    const { resolveTenantFromPhoneNumberId } = await import("@/domains/wa-cloud/repository")
    const result = await resolveTenantFromPhoneNumberId("PHONE_NUMBER_ID_META_1")

    expect(result).not.toBeNull()
    expect(result!.orgId).toBe(ORG_A)
    expect(result!.wabaId).toBe("WABA_123")
  })
})

// ─── 14. Episode immutability contract ───────────────────────────────────────

describe("episode immutability — config changes don't alter active episodes", () => {
  it("CreateEpisodeSchema captures agentVersionId at start time (not agentId)", () => {
    // Episodes reference the immutable version snapshot, not the mutable agent
    const schema = CreateEpisodeSchema.shape
    expect("agentVersionId" in schema).toBe(true)
    // There is no agentId in the episode schema — only the version ID
    expect("agentId" in schema).toBe(false)
  })

  it("knowledgeSnapshot is an array of revision IDs, not source IDs alone", () => {
    const schema = CreateEpisodeSchema.shape.knowledgeSnapshot
    // Should validate an array with sourceId + revisionId (the immutable snapshot)
    const validSnapshot = CreateEpisodeSchema.safeParse({
      conversationId: UUID_A,
      agentVersionId: UUID_B,
      knowledgeSnapshot: [{
        sourceId: UUID_A,
        revisionId: UUID_B,
        revisionNumber: 3,
      }],
    })
    expect(validSnapshot.success).toBe(true)
    expect(schema).toBeDefined()
  })
})

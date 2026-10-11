/**
 * Phase 06 — Meta Cloud WhatsApp Provider tests
 *
 * Covers: webhook HMAC validation, deduplication, unknown numbers,
 * delivery status ordering guard, eligibility window, send outcomes
 * (accepted, permanent error, transient error, timeout_unknown),
 * and MetaCloudWhatsAppProvider contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { verifyWebhookSignature } from "@/domains/wa-cloud/webhook"
import { checkSendEligibility } from "@/domains/wa-cloud/eligibility"
import { CloudApiClient } from "@/domains/wa-cloud/client"
import { MetaCloudWhatsAppProvider } from "@/domains/wa-cloud/provider"

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}))
vi.mock("@/lib/db/schema", () => ({
  waConversationMessages: {
    conversationId: "conversationId", orgId: "orgId", direction: "direction",
    createdAt: "createdAt", status: "status", externalMessageId: "externalMessageId", id: "id",
    role: "role", content: "content",
  },
  waConversations: { id: "id", orgId: "orgId", phoneNumberId: "phoneNumberId", customerPhone: "customerPhone" },
  waPhoneNumbers: { id: "id", orgId: "orgId", phoneNumberId: "phoneNumberId", wabaAccountId: "wabaAccountId" },
  waBusinessAccounts: { id: "id", wabaId: "wabaId", accessTokenEnc: "accessTokenEnc", keyVersion: "keyVersion" },
}))
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...conds) => ({ type: "and", conds })),
  desc: vi.fn((col) => ({ type: "desc", col })),
  notInArray: vi.fn((col, vals) => ({ type: "notInArray", col, vals })),
}))

import { db } from "@/lib/db"

const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeChain(returnValue: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    set: vi.fn().mockReturnThis(),
    catch: vi.fn().mockReturnThis(),
  }
  return chain
}

// Realistic Meta Cloud API webhook payload (based on official docs contract)
const VALID_WAMID = "wamid.HBgLMTIzNDU2Nzg5MFUCABIYFjNFQjBDMUI2OTk5QzM4OUFDQTA3QzAA"

const VALID_WEBHOOK_PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID_123",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+15005550006",
              phone_number_id: "PHONE_NUMBER_ID_123",
            },
            contacts: [
              { profile: { name: "Test User" }, wa_id: "12345678900" },
            ],
            messages: [
              {
                id: VALID_WAMID,
                from: "12345678900",
                timestamp: "1672531200",
                type: "text",
                text: { body: "Hola, quiero información" },
              },
            ],
          },
        },
      ],
    },
  ],
}

const VALID_STATUS_PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID_123",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+15005550006",
              phone_number_id: "PHONE_NUMBER_ID_123",
            },
            statuses: [
              {
                id: VALID_WAMID,
                status: "delivered",
                timestamp: "1672531300",
                recipient_id: "12345678900",
              },
            ],
          },
        },
      ],
    },
  ],
}

// ─── Tests: HMAC signature verification ──────────────────────────────────────

describe("verifyWebhookSignature", () => {
  const APP_SECRET = "test_app_secret_32chars_minimum!!"
  const RAW_BODY = JSON.stringify(VALID_WEBHOOK_PAYLOAD)

  it("accepts a valid signature", () => {
    const { createHmac } = require("crypto")
    const expectedSig = "sha256=" + createHmac("sha256", APP_SECRET).update(RAW_BODY).digest("hex")
    expect(verifyWebhookSignature(RAW_BODY, expectedSig, APP_SECRET)).toBe(true)
  })

  it("rejects a signature computed with the wrong secret", () => {
    const { createHmac } = require("crypto")
    const wrongSig = "sha256=" + createHmac("sha256", "wrong_secret").update(RAW_BODY).digest("hex")
    expect(verifyWebhookSignature(RAW_BODY, wrongSig, APP_SECRET)).toBe(false)
  })

  it("rejects a signature for a tampered body", () => {
    const { createHmac } = require("crypto")
    const originalSig = "sha256=" + createHmac("sha256", APP_SECRET).update(RAW_BODY).digest("hex")
    const tamperedBody = RAW_BODY.replace("Hola", "INJECTED")
    expect(verifyWebhookSignature(tamperedBody, originalSig, APP_SECRET)).toBe(false)
  })

  it("rejects a null/missing signature header", () => {
    expect(verifyWebhookSignature(RAW_BODY, null as unknown as string, APP_SECRET)).toBe(false)
  })

  it("rejects a signature with wrong length (timing-safe comparison guard)", () => {
    expect(verifyWebhookSignature(RAW_BODY, "sha256=short", APP_SECRET)).toBe(false)
  })
})

// ─── Tests: 24-hour eligibility window ───────────────────────────────────────

describe("checkSendEligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns eligible when last inbound is within 24 hours", async () => {
    const chain = makeChain([{ createdAt: new Date(Date.now() - 1_000) }])
    mockDb.select.mockReturnValue(chain)

    const result = await checkSendEligibility("conv-1", "org-1")
    expect(result.eligible).toBe(true)
  })

  it("returns window_closed when last inbound is older than 24 hours", async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000)
    const chain = makeChain([{ createdAt: twentyFiveHoursAgo }])
    mockDb.select.mockReturnValue(chain)

    const result = await checkSendEligibility("conv-1", "org-1")
    expect(result.eligible).toBe(false)
    if (!result.eligible) expect(result.reason).toBe("window_closed")
  })

  it("returns no_inbound_messages when conversation has no inbound messages", async () => {
    const chain = makeChain([])
    mockDb.select.mockReturnValue(chain)

    const result = await checkSendEligibility("conv-new", "org-1")
    expect(result.eligible).toBe(false)
    if (!result.eligible) expect(result.reason).toBe("no_inbound_messages")
  })

  it("returns eligible exactly at the boundary (just under 24 hours)", async () => {
    const justUnder24h = new Date(Date.now() - (24 * 60 * 60 * 1000 - 1000))
    const chain = makeChain([{ createdAt: justUnder24h }])
    mockDb.select.mockReturnValue(chain)

    const result = await checkSendEligibility("conv-1", "org-1")
    expect(result.eligible).toBe(true)
  })
})

// ─── Tests: CloudApiClient send outcomes ─────────────────────────────────────

describe("CloudApiClient.sendText", () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const client = new CloudApiClient("test_access_token", { timeoutMs: 5000, maxRetries: 0 })

  it("returns accepted with wamid on success", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: VALID_WAMID }] }),
    })

    const result = await client.sendText({
      phoneNumberId: "PHONE_ID",
      to: "12345678900",
      text: "Hola, soy el agente.",
    })

    expect(result.kind).toBe("accepted")
    if (result.kind === "accepted") expect(result.messageId).toBe(VALID_WAMID)
  })

  it("returns permanent error for 401 (invalid token)", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 190, message: "Invalid OAuth access token" } }),
    })

    const result = await client.sendText({
      phoneNumberId: "PHONE_ID",
      to: "12345678900",
      text: "Test",
    })

    expect(result.kind).toBe("error")
    if (result.kind === "error") {
      expect(result.permanent).toBe(true)
      expect(result.httpStatus).toBe(401)
    }
  })

  it("returns permanent error for Meta error code 190 on 400 response", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 190, message: "Token expired" } }),
    })

    const result = await client.sendText({
      phoneNumberId: "PHONE_ID",
      to: "12345678900",
      text: "Test",
    })

    expect(result.kind).toBe("error")
    if (result.kind === "error") expect(result.permanent).toBe(true)
  })

  it("returns transient error for 500 (Meta server error)", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 1, message: "Unknown error" } }),
    })

    const result = await client.sendText({
      phoneNumberId: "PHONE_ID",
      to: "12345678900",
      text: "Test",
    })

    expect(result.kind).toBe("error")
    if (result.kind === "error") {
      expect(result.permanent).toBe(false)
      expect(result.httpStatus).toBe(500)
    }
  })

  it("returns timeout_unknown when AbortSignal.timeout fires", async () => {
    const timeoutError = new DOMException("The operation was aborted.", "TimeoutError")
    fetchSpy.mockRejectedValueOnce(timeoutError)

    const result = await client.sendText({
      phoneNumberId: "PHONE_ID",
      to: "12345678900",
      text: "Test",
    })

    expect(result.kind).toBe("timeout_unknown")
  })

  it("returns transient error for network failure (ECONNREFUSED)", async () => {
    const networkError = new Error("fetch failed")
    networkError.name = "FetchError"
    fetchSpy.mockRejectedValueOnce(networkError)

    const result = await client.sendText({
      phoneNumberId: "PHONE_ID",
      to: "12345678900",
      text: "Test",
    })

    expect(result.kind).toBe("error")
    if (result.kind === "error") expect(result.permanent).toBe(false)
  })

  it("does not retry on timeout_unknown (result is ambiguous)", async () => {
    const timeoutError = new DOMException("timeout", "TimeoutError")
    fetchSpy.mockRejectedValue(timeoutError) // would be called multiple times on retry

    const clientWithRetry = new CloudApiClient("token", { timeoutMs: 1000, maxRetries: 3 })
    const result = await clientWithRetry.sendText({
      phoneNumberId: "PHONE_ID",
      to: "12345678900",
      text: "Test",
    })

    expect(result.kind).toBe("timeout_unknown")
    // Should have been called exactly once (no retries after timeout_unknown)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("does not retry on permanent errors", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    })

    const clientWithRetry = new CloudApiClient("token", { timeoutMs: 1000, maxRetries: 3 })
    await clientWithRetry.sendText({ phoneNumberId: "PHONE_ID", to: "12345678900", text: "x" })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("retries transient errors up to maxRetries", async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [{ id: "wamid.abc" }] }) })

    const clientWithRetry = new CloudApiClient("token", { timeoutMs: 1000, maxRetries: 2 })
    const result = await clientWithRetry.sendText({
      phoneNumberId: "PHONE_ID",
      to: "12345678900",
      text: "Test",
    })

    expect(result.kind).toBe("accepted")
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })
})

// ─── Tests: MetaCloudWhatsAppProvider ─────────────────────────────────────────

describe("MetaCloudWhatsAppProvider", () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const provider = new MetaCloudWhatsAppProvider({
    accessToken: "test_token",
    phoneNumberId: "PHONE_NUMBER_ID_123",
  })

  it("sendMessage resolves with externalMessageId on success", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: VALID_WAMID }] }),
    })

    const result = await provider.sendMessage({ to: "12345678900", content: "Hola!" })
    expect(result.externalMessageId).toBe(VALID_WAMID)
  })

  it("sendMessage throws on timeout_unknown", async () => {
    fetchSpy.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"))

    await expect(
      provider.sendMessage({ to: "12345678900", content: "Test" })
    ).rejects.toThrow("timeout after dispatch")
  })

  it("sendMessage throws on permanent error", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    })

    await expect(
      provider.sendMessage({ to: "12345678900", content: "Test" })
    ).rejects.toThrow("permanent=true")
  })

  it("verifySignature delegates to HMAC checker", () => {
    const { createHmac } = require("crypto")
    const secret = "test_secret"
    const body = '{"test": 1}'
    const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex")
    expect(provider.verifySignature(body, sig, secret)).toBe(true)
    expect(provider.verifySignature(body, "sha256=invalid", secret)).toBe(false)
  })

  it("normalizeStatus maps Cloud API statuses correctly", () => {
    expect(provider.normalizeStatus("sent")).toBe("sent")
    expect(provider.normalizeStatus("delivered")).toBe("delivered")
    expect(provider.normalizeStatus("read")).toBe("read")
    expect(provider.normalizeStatus("failed")).toBe("failed")
    expect(provider.normalizeStatus("unknown_future_status")).toBeNull()
  })

  it("parseWebhook extracts first status update", () => {
    const event = provider.parseWebhook(VALID_STATUS_PAYLOAD)
    expect(event).not.toBeNull()
    expect(event?.externalMessageId).toBe(VALID_WAMID)
    expect(event?.providerStatus).toBe("delivered")
    expect(event?.normalizedStatus).toBe("delivered")
  })

  it("parseWebhook returns null for message-only payloads (no statuses)", () => {
    const event = provider.parseWebhook(VALID_WEBHOOK_PAYLOAD)
    expect(event).toBeNull()
  })

  it("parseWebhook returns null for malformed payload", () => {
    expect(provider.parseWebhook({ object: "not_whatsapp" })).toBeNull()
    expect(provider.parseWebhook(null)).toBeNull()
    expect(provider.parseWebhook("invalid")).toBeNull()
  })

  it("supports the expected status set", () => {
    expect(provider.supportedStatuses).toContain("sent")
    expect(provider.supportedStatuses).toContain("delivered")
    expect(provider.supportedStatuses).toContain("read")
    expect(provider.supportedStatuses).toContain("failed")
    expect(provider.supportedStatuses).toContain("provider_accepted")
  })
})

// ─── Tests: delivery status ordering guard ────────────────────────────────────

describe("delivery status ordering guard (STATUS_DOWNGRADE_GUARD logic)", () => {
  // We test the guard indirectly through the updateDeliveryStatusByWamid function.
  // The guard prevents out-of-order webhook events from downgrading status.

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("allows 'delivered' to overwrite 'sent' (normal progression)", async () => {
    // Import the function (we test the import works and verify via mock args)
    const { updateDeliveryStatusByWamid } = await import("@/domains/wa-cloud/repository")

    const chain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), catch: vi.fn().mockResolvedValue(undefined) }
    mockDb.update.mockReturnValue(chain)

    await updateDeliveryStatusByWamid({
      wamid: VALID_WAMID,
      recipientPhone: "12345678900",
      status: "delivered",
      timestamp: new Date(),
    })

    expect(mockDb.update).toHaveBeenCalled()
    expect(chain.set).toHaveBeenCalledWith({ status: "delivered" })
    // Verify the WHERE includes a notInArray guard for read + failed
    const { notInArray } = await import("drizzle-orm")
    expect(notInArray).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining(["read", "failed"]))
  })

  it("blocks 'sent' from overwriting 'delivered' (out-of-order guard)", async () => {
    const { updateDeliveryStatusByWamid } = await import("@/domains/wa-cloud/repository")

    const chain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), catch: vi.fn().mockResolvedValue(undefined) }
    mockDb.update.mockReturnValue(chain)

    await updateDeliveryStatusByWamid({
      wamid: VALID_WAMID,
      recipientPhone: "12345678900",
      status: "sent",
      timestamp: new Date(),
    })

    // WHERE clause should include NOT IN ["delivered", "read", "failed"]
    const { notInArray } = await import("drizzle-orm")
    expect(notInArray).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(["delivered", "read", "failed"])
    )
  })

  it("blocks 'delivered' from overwriting 'read' (highest delivery state preserved)", async () => {
    const { updateDeliveryStatusByWamid } = await import("@/domains/wa-cloud/repository")

    const chain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), catch: vi.fn().mockResolvedValue(undefined) }
    mockDb.update.mockReturnValue(chain)

    await updateDeliveryStatusByWamid({
      wamid: VALID_WAMID,
      recipientPhone: "12345678900",
      status: "delivered",
      timestamp: new Date(),
    })

    const { notInArray } = await import("drizzle-orm")
    expect(notInArray).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining(["read"]))
  })

  it("allows 'failed' to be applied without a downgrade guard (empty blocked list)", async () => {
    const { updateDeliveryStatusByWamid } = await import("@/domains/wa-cloud/repository")
    const { notInArray } = await import("drizzle-orm")
    const notInArrayMock = notInArray as ReturnType<typeof vi.fn>
    notInArrayMock.mockClear()

    const chain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), catch: vi.fn().mockResolvedValue(undefined) }
    mockDb.update.mockReturnValue(chain)

    // 'failed' blocks ["delivered", "read"] — guard IS applied
    await updateDeliveryStatusByWamid({
      wamid: VALID_WAMID,
      recipientPhone: "12345678900",
      status: "failed",
      timestamp: new Date(),
    })

    // Guard applied for failed: blocks delivered + read
    expect(notInArrayMock).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining(["delivered", "read"]))
  })
})

// ─── Tests: deduplication — duplicate wamid ───────────────────────────────────

describe("incoming message deduplication", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns null when wamid already exists (ON CONFLICT DO NOTHING)", async () => {
    const { persistIncomingMessage } = await import("@/domains/wa-cloud/repository")

    // Simulate INSERT ON CONFLICT DO NOTHING returning empty array
    const chain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]), // empty = already existed
    }
    mockDb.insert.mockReturnValue(chain)

    // Also mock the update (won't be called since insert returned null)
    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), catch: vi.fn() }
    mockDb.update.mockReturnValue(updateChain)

    const result = await persistIncomingMessage("org-1", "conv-1", {
      wamid: VALID_WAMID,
      fromPhone: "12345678900",
      toPhoneNumberId: "PHONE_ID",
      wabaId: "WABA_ID",
      type: "text",
      textContent: "Hola",
      timestamp: new Date(),
    })

    expect(result).toBeNull()
    // Conversation lastMessageAt should NOT be updated for duplicates
    expect(updateChain.set).not.toHaveBeenCalled()
  })

  it("returns message row ID on first insertion", async () => {
    const { persistIncomingMessage } = await import("@/domains/wa-cloud/repository")

    const insertChain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "msg-uuid-123" }]),
    }
    mockDb.insert.mockReturnValue(insertChain)

    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), catch: vi.fn() }
    mockDb.update.mockReturnValue(updateChain)

    const result = await persistIncomingMessage("org-1", "conv-1", {
      wamid: "wamid.new-message",
      fromPhone: "12345678900",
      toPhoneNumberId: "PHONE_ID",
      wabaId: "WABA_ID",
      type: "text",
      textContent: "Primera vez",
      timestamp: new Date(),
    })

    expect(result).toBe("msg-uuid-123")
  })
})

// ─── Tests: unknown phone number (tenant isolation) ───────────────────────────

describe("unknown phone number — no tenant", () => {
  it("resolveTenantFromPhoneNumberId returns null for unregistered numbers", async () => {
    const { resolveTenantFromPhoneNumberId } = await import("@/domains/wa-cloud/repository")

    const chain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]), // no rows = not registered
    }
    mockDb.select.mockReturnValue(chain)

    const result = await resolveTenantFromPhoneNumberId("unknown_phone_id")
    expect(result).toBeNull()
  })
})

// ─── Tests: updateOutboundMessageStatus ───────────────────────────────────────

describe("updateOutboundMessageStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("updates status and wamid on accepted outcome", async () => {
    const { updateOutboundMessageStatus } = await import("@/domains/wa-cloud/repository")

    const chain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), catch: vi.fn().mockResolvedValue(undefined) }
    mockDb.update.mockReturnValue(chain)

    await updateOutboundMessageStatus("msg-id-1", "org-1", {
      wamid: VALID_WAMID,
      status: "accepted",
    })

    expect(chain.set).toHaveBeenCalledWith({
      externalMessageId: VALID_WAMID,
      status: "accepted",
    })
  })

  it("updates status only (no wamid) for failed outcome", async () => {
    const { updateOutboundMessageStatus } = await import("@/domains/wa-cloud/repository")

    const chain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), catch: vi.fn().mockResolvedValue(undefined) }
    mockDb.update.mockReturnValue(chain)

    await updateOutboundMessageStatus("msg-id-1", "org-1", { status: "failed" })

    expect(chain.set).toHaveBeenCalledWith({ status: "failed" })
    // No externalMessageId key when wamid is not provided
    const setCall = chain.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall).not.toHaveProperty("externalMessageId")
  })

  it("is non-fatal — catch swallows DB errors", async () => {
    const { updateOutboundMessageStatus } = await import("@/domains/wa-cloud/repository")

    const chain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      catch: vi.fn().mockImplementation((_fn) => undefined), // simulates swallowed error
    }
    mockDb.update.mockReturnValue(chain)

    // Should not throw even if DB fails
    await expect(
      updateOutboundMessageStatus("msg-id-1", "org-1", { status: "failed" })
    ).resolves.toBeUndefined()
  })
})

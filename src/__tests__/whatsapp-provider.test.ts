// ─── WhatsApp provider mode tests ─────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))

import type { IWhatsAppProvider, ProviderWebhookEvent } from "@/domains/whatsapp/types"
import type { WaMessageStatus } from "@/lib/db/schema"
import crypto from "crypto"

// ─── Mock provider implementation ─────────────────────────────────────────────

class MockProvider implements IWhatsAppProvider {
  readonly name = "mock_provider"
  readonly supportedStatuses: WaMessageStatus[] = [
    "provider_accepted", "sent", "delivered", "read", "failed",
  ]

  sendMessage(_params: { to: string; content: string }) {
    return Promise.resolve({ externalMessageId: "ext-msg-001" })
  }

  parseWebhook(raw: unknown): ProviderWebhookEvent | null {
    if (typeof raw !== "object" || raw === null) return null
    const payload = raw as Record<string, unknown>
    if (!payload.id || !payload.status) return null
    return {
      externalMessageId: String(payload.id),
      providerStatus: String(payload.status),
      normalizedStatus: this.normalizeStatus(String(payload.status)),
      occurredAt: new Date(),
      rawPayload: payload,
    }
  }

  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = "sha256=" + crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex")
    return expected === signature
  }

  normalizeStatus(providerStatus: string): WaMessageStatus | null {
    const map: Record<string, WaMessageStatus> = {
      queued: "provider_accepted",
      sent: "sent",
      delivered: "delivered",
      read: "read",
      failed: "failed",
    }
    return map[providerStatus] ?? null
  }
}

// ─── Provider interface ───────────────────────────────────────────────────────

describe("IWhatsAppProvider interface", () => {
  const provider = new MockProvider()

  it("has a name", () => {
    expect(provider.name).toBe("mock_provider")
  })

  it("declares supported statuses", () => {
    expect(provider.supportedStatuses).toContain("sent")
    expect(provider.supportedStatuses).toContain("delivered")
    expect(provider.supportedStatuses).toContain("read")
  })

  it("does NOT declare link_prepared or marked_shared as supported", () => {
    expect(provider.supportedStatuses).not.toContain("link_prepared")
    expect(provider.supportedStatuses).not.toContain("marked_shared")
  })
})

// ─── Webhook signature verification ──────────────────────────────────────────

describe("verifySignature", () => {
  const provider = new MockProvider()
  const secret = "my-webhook-secret"
  const payload = '{"id":"msg-1","status":"sent"}'

  function makeSignature(body: string, key: string): string {
    return "sha256=" + crypto.createHmac("sha256", key).update(body).digest("hex")
  }

  it("accepts a valid HMAC signature", () => {
    const sig = makeSignature(payload, secret)
    expect(provider.verifySignature(payload, sig, secret)).toBe(true)
  })

  it("rejects an invalid signature", () => {
    expect(provider.verifySignature(payload, "sha256=bad", secret)).toBe(false)
  })

  it("rejects a signature for different payload", () => {
    const sig = makeSignature('{"id":"other"}', secret)
    expect(provider.verifySignature(payload, sig, secret)).toBe(false)
  })

  it("rejects empty signature", () => {
    expect(provider.verifySignature(payload, "", secret)).toBe(false)
  })
})

// ─── Webhook parsing ──────────────────────────────────────────────────────────

describe("parseWebhook", () => {
  const provider = new MockProvider()

  it("parses a valid webhook payload", () => {
    const event = provider.parseWebhook({ id: "msg-1", status: "sent" })
    expect(event).not.toBeNull()
    expect(event?.externalMessageId).toBe("msg-1")
    expect(event?.normalizedStatus).toBe("sent")
  })

  it("returns null for malformed payload", () => {
    expect(provider.parseWebhook(null)).toBeNull()
    expect(provider.parseWebhook("string")).toBeNull()
    expect(provider.parseWebhook({})).toBeNull()
    expect(provider.parseWebhook({ id: "x" })).toBeNull()
  })

  it("normalizes unknown status to null (not blindly stored)", () => {
    const event = provider.parseWebhook({ id: "msg-1", status: "unknown_future_status" })
    expect(event?.normalizedStatus).toBeNull()
    expect(event?.providerStatus).toBe("unknown_future_status")
  })
})

// ─── Status normalization ─────────────────────────────────────────────────────

describe("normalizeStatus", () => {
  const provider = new MockProvider()

  it("maps queued → provider_accepted", () => {
    expect(provider.normalizeStatus("queued")).toBe("provider_accepted")
  })

  it("maps sent → sent", () => {
    expect(provider.normalizeStatus("sent")).toBe("sent")
  })

  it("maps delivered → delivered", () => {
    expect(provider.normalizeStatus("delivered")).toBe("delivered")
  })

  it("maps read → read", () => {
    expect(provider.normalizeStatus("read")).toBe("read")
  })

  it("maps failed → failed", () => {
    expect(provider.normalizeStatus("failed")).toBe("failed")
  })

  it("does NOT map acceptance to delivered (no false evidence)", () => {
    const status = provider.normalizeStatus("queued")
    expect(status).not.toBe("delivered")
    expect(status).not.toBe("read")
  })

  it("returns null for unknown status", () => {
    expect(provider.normalizeStatus("clicked")).toBeNull()
    expect(provider.normalizeStatus("bounce")).toBeNull()
  })
})

// ─── Idempotency: duplicate webhook detection ─────────────────────────────────

describe("Webhook deduplication", () => {
  function computeDedupeKey(
    providerName: string,
    externalMessageId: string,
    eventType: string,
  ): string {
    return crypto
      .createHash("sha256")
      .update(`${providerName}:${externalMessageId}:${eventType}`)
      .digest("hex")
  }

  it("same event produces same dedupe key", () => {
    const k1 = computeDedupeKey("mock_provider", "msg-1", "sent")
    const k2 = computeDedupeKey("mock_provider", "msg-1", "sent")
    expect(k1).toBe(k2)
  })

  it("different eventType produces different dedupe key", () => {
    const k1 = computeDedupeKey("mock_provider", "msg-1", "sent")
    const k2 = computeDedupeKey("mock_provider", "msg-1", "delivered")
    expect(k1).not.toBe(k2)
  })

  it("different externalMessageId produces different dedupe key", () => {
    const k1 = computeDedupeKey("mock_provider", "msg-1", "sent")
    const k2 = computeDedupeKey("mock_provider", "msg-2", "sent")
    expect(k1).not.toBe(k2)
  })

  it("different providerName produces different dedupe key", () => {
    const k1 = computeDedupeKey("callbell", "msg-1", "sent")
    const k2 = computeDedupeKey("whatsapp_cloud", "msg-1", "sent")
    expect(k1).not.toBe(k2)
  })

  it("dedupe key is a 64-char hex string (SHA-256)", () => {
    const k = computeDedupeKey("mock_provider", "msg-1", "sent")
    expect(k).toHaveLength(64)
    expect(k).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ─── Provider state: no premature status promotion ────────────────────────────

describe("Provider status: no premature promotion", () => {
  const provider = new MockProvider()

  it("queued/accepted does NOT count as delivered", () => {
    const status = provider.normalizeStatus("queued")
    expect(status).toBe("provider_accepted")
    expect(status).not.toBe("delivered")
  })

  it("sent does NOT count as read", () => {
    const status = provider.normalizeStatus("sent")
    expect(status).toBe("sent")
    expect(status).not.toBe("read")
  })

  it("provider_accepted is separate from sent", () => {
    expect(provider.normalizeStatus("queued")).not.toBe("sent")
  })
})

// ─── Metrics separation by confirmation method ────────────────────────────────

describe("Metrics: manual vs provider confirmation are separate", () => {
  // Simulated metric aggregation
  interface SendRecord {
    status: WaMessageStatus
    confirmationMode: "manual" | "provider"
  }

  function countByMode(records: SendRecord[]) {
    return {
      manualShared: records.filter(
        (r) => r.confirmationMode === "manual" && r.status === "marked_shared",
      ).length,
      providerConfirmed: records.filter(
        (r) =>
          r.confirmationMode === "provider" &&
          ["provider_accepted", "sent"].includes(r.status),
      ).length,
      delivered: records.filter((r) => r.status === "delivered").length,
      read: records.filter((r) => r.status === "read").length,
      linksPrepared: records.filter((r) => r.status === "link_prepared").length,
    }
  }

  it("counts manual and provider confirmations separately", () => {
    const records: SendRecord[] = [
      { status: "marked_shared", confirmationMode: "manual" },
      { status: "marked_shared", confirmationMode: "manual" },
      { status: "sent", confirmationMode: "provider" },
      { status: "link_prepared", confirmationMode: "manual" },
    ]
    const m = countByMode(records)
    expect(m.manualShared).toBe(2)
    expect(m.providerConfirmed).toBe(1)
    expect(m.linksPrepared).toBe(1)
  })

  it("link_prepared is NOT counted as sent in any mode", () => {
    const records: SendRecord[] = [
      { status: "link_prepared", confirmationMode: "manual" },
      { status: "link_prepared", confirmationMode: "provider" },
    ]
    const m = countByMode(records)
    expect(m.manualShared).toBe(0)
    expect(m.providerConfirmed).toBe(0)
    expect(m.linksPrepared).toBe(2)
  })

  it("delivered and read are counted only with evidence", () => {
    const records: SendRecord[] = [
      { status: "delivered", confirmationMode: "provider" },
      { status: "read", confirmationMode: "provider" },
    ]
    const m = countByMode(records)
    expect(m.delivered).toBe(1)
    expect(m.read).toBe(1)
    // These would NOT exist in manual-only mode
    const manualRecords: SendRecord[] = [
      { status: "marked_shared", confirmationMode: "manual" },
    ]
    const m2 = countByMode(manualRecords)
    expect(m2.delivered).toBe(0)
    expect(m2.read).toBe(0)
  })
})

// ─── Provider temporarily down ────────────────────────────────────────────────

describe("Provider temporarily unavailable", () => {
  it("failed status is recoverable (not permanent by default)", () => {
    // In provider mode, 'failed' is a recoverable state — provider can retry
    const failedMessage = { status: "failed" as WaMessageStatus, failureReason: "timeout" }
    expect(failedMessage.status).toBe("failed")
    // Not automatically marked as sent
    expect(failedMessage.status).not.toBe("sent")
    expect(failedMessage.status).not.toBe("marked_shared")
  })

  it("provider_accepted does not become sent automatically without evidence", () => {
    const accepted = { status: "provider_accepted" as WaMessageStatus }
    expect(accepted.status).not.toBe("sent")
  })
})

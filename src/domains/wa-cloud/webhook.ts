import "server-only"
import { createHmac, timingSafeEqual } from "crypto"
import {
  MetaWebhookPayloadSchema,
  type MetaWebhookPayload,
  type ParsedIncomingMessage,
  type ParsedStatusUpdate,
} from "./types"

// ─── HMAC signature verification ─────────────────────────────────────────────

/**
 * Verifies X-Hub-Signature-256 against the WABA's app secret.
 * Uses timing-safe comparison to prevent timing attacks.
 * Returns true if signature is valid or appSecret is not configured (dev mode).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader) return false
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex")
  try {
    return timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected))
  } catch {
    // Buffers of different length — reject
    return false
  }
}

// ─── Payload parsing ──────────────────────────────────────────────────────────

export interface ParseWebhookResult {
  messages: ParsedIncomingMessage[]
  statuses: ParsedStatusUpdate[]
}

/**
 * Parses and normalizes a raw Meta Cloud API webhook payload.
 * Returns empty arrays on schema mismatch (forward-compatibility).
 */
export function parseWebhookPayload(raw: unknown): ParseWebhookResult {
  const parsed = MetaWebhookPayloadSchema.safeParse(raw)
  if (!parsed.success) return { messages: [], statuses: [] }

  return extractPayload(parsed.data)
}

function extractPayload(payload: MetaWebhookPayload): ParseWebhookResult {
  const messages: ParsedIncomingMessage[] = []
  const statuses: ParsedStatusUpdate[] = []

  for (const entry of payload.entry) {
    const wabaId = entry.id

    for (const change of entry.changes) {
      if (change.field !== "messages") continue
      const value = change.value

      const { metadata, contacts = [], messages: msgs = [], statuses: stats = [] } = value
      const toPhoneNumberId = metadata.phone_number_id
      const displayPhoneNumber = metadata.display_phone_number

      // Build contact name lookup: wa_id → name
      const nameByWaId: Record<string, string> = {}
      for (const c of contacts) {
        if (c.wa_id) nameByWaId[c.wa_id] = c.profile.name
      }

      for (const msg of msgs) {
        const normalized: ParsedIncomingMessage = {
          wamid: msg.id,
          fromPhone: msg.from,
          toPhoneNumberId,
          displayPhoneNumber,
          wabaId,
          customerName: nameByWaId[msg.from],
          type: msg.type,
          timestamp: new Date(parseInt(msg.timestamp, 10) * 1000),
        }

        if (msg.type === "text" && msg.text) {
          normalized.textContent = msg.text.body
        } else if (
          (msg.type === "image" || msg.type === "audio" || msg.type === "document" ||
           msg.type === "video" || msg.type === "sticker") && msg[msg.type]
        ) {
          // All media types share the same shape
          const media = msg[msg.type as "image"] as { id: string; mime_type?: string; caption?: string }
          normalized.mediaId = media?.id
          normalized.mimeType = media?.mime_type
          normalized.caption = media?.caption
        }

        messages.push(normalized)
      }

      for (const stat of stats) {
        const parsed: ParsedStatusUpdate = {
          wamid: stat.id,
          recipientPhone: stat.recipient_id,
          status: stat.status,
          timestamp: new Date(parseInt(stat.timestamp, 10) * 1000),
        }

        if (stat.errors?.[0]) {
          parsed.errorCode = stat.errors[0].code
          // Sanitize: expose only the title (no internal Meta detail)
          parsed.errorTitle = stat.errors[0].title
        }

        statuses.push(parsed)
      }
    }
  }

  return { messages, statuses }
}

import "server-only"
import type { IWhatsAppProvider, ProviderWebhookEvent } from "@/domains/whatsapp/types"
import type { WaMessageStatus } from "@/lib/db/schema"
import { CloudApiClient } from "./client"
import { verifyWebhookSignature, parseWebhookPayload } from "./webhook"

// ─── Status mapping ───────────────────────────────────────────────────────────
// Meta Cloud API delivery statuses → WaMessageStatus enum values.
// "provider_accepted" is set by the cron when Meta returns 200 on send.

const DELIVERY_STATUS_MAP: Partial<Record<string, WaMessageStatus>> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
}

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * Concrete implementation of IWhatsAppProvider backed by Meta Cloud API.
 *
 * Scope: one phone number per instance. Inject the access token and phoneNumberId
 * from the wa_business_accounts / wa_phone_numbers tables (server-side only —
 * the access token is decrypted at call time, never stored in plaintext).
 *
 * Limitations:
 * - `sendMessage` raises if the result is timeout_unknown or a permanent error.
 *   The caller must decide how to surface this to the user.
 * - `parseWebhook` returns only the first status update in a payload. Use the
 *   wa-cloud webhook route for full inbound message + multi-status handling.
 * - Does NOT auto-convert AI-generated responses to pre-approved templates.
 *   Template sending is a separate, operator-approved flow.
 *
 * Coexistence with the mobile app: Meta Cloud API and the WhatsApp mobile app
 * cannot be active on the same phone number simultaneously. If the number is
 * registered in Business Manager under Cloud API, the mobile app is disabled for
 * that number. Document this to the operator before registering a number.
 */
export class MetaCloudWhatsAppProvider implements IWhatsAppProvider {
  readonly name = "meta_cloud"
  readonly supportedStatuses: WaMessageStatus[] = [
    "provider_accepted",
    "sent",
    "delivered",
    "read",
    "failed",
  ]

  private readonly client: CloudApiClient
  private readonly phoneNumberId: string

  constructor(opts: { accessToken: string; phoneNumberId: string }) {
    this.client = new CloudApiClient(opts.accessToken)
    this.phoneNumberId = opts.phoneNumberId
  }

  async sendMessage(params: {
    to: string
    content: string
    externalRef?: string
  }): Promise<{ externalMessageId: string }> {
    const outcome = await this.client.sendText({
      phoneNumberId: this.phoneNumberId,
      to: params.to,
      text: params.content,
    })

    if (outcome.kind === "accepted") {
      return { externalMessageId: outcome.messageId }
    }

    if (outcome.kind === "timeout_unknown") {
      throw new Error(
        "MetaCloudWhatsAppProvider: send result unknown — timeout after dispatch. " +
        "The message may be in transit. Do not resend without checking delivery status."
      )
    }

    throw new Error(
      `MetaCloudWhatsAppProvider: send failed (permanent=${outcome.permanent}, status=${outcome.httpStatus ?? "unknown"})`
    )
  }

  parseWebhook(raw: unknown): ProviderWebhookEvent | null {
    const { statuses } = parseWebhookPayload(raw)
    const stat = statuses[0]
    if (!stat) return null

    return {
      externalMessageId: stat.wamid,
      providerStatus: stat.status,
      normalizedStatus: this.normalizeStatus(stat.status),
      occurredAt: stat.timestamp,
      rawPayload: raw as Record<string, unknown>,
    }
  }

  verifySignature(payload: string, signature: string, secret: string): boolean {
    return verifyWebhookSignature(payload, signature, secret)
  }

  normalizeStatus(providerStatus: string): WaMessageStatus | null {
    return DELIVERY_STATUS_MAP[providerStatus] ?? null
  }
}

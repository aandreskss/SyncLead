import "server-only"
import type { SendTextParams, SendTemplateParams } from "./types"

const META_GRAPH_BASE = "https://graph.facebook.com"

// Permanent HTTP status codes — retrying identical payload will always fail.
const PERMANENT_HTTP_STATUSES = new Set([400, 401, 403, 404, 410])

// Permanent Meta error codes (auth failures, policy violations).
// Reference: developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
const PERMANENT_META_ERROR_CODES = new Set([
  100, // Invalid parameter
  190, // Access token expired / invalid
  200, // Permissions error
  273, // Business account policy violation
])

// ─── Result type ──────────────────────────────────────────────────────────────

/**
 * Discriminated union returned by sendText / sendTemplate.
 *
 * - "accepted": Meta accepted the message. `messageId` is the wamid for delivery tracking.
 * - "error": Send failed. `permanent` = true means retrying the same payload won't help
 *   (auth failure, bad phone number, policy). `permanent` = false means a transient error
 *   (5xx, network, rate limit) where retry may succeed.
 * - "timeout_unknown": The request timed out AFTER being dispatched. Meta may or may not
 *   have received it. Do NOT blindly resend — the message may already be in transit.
 *   Exactly-once delivery cannot be guaranteed in this case.
 */
export type SendOutcome =
  | { kind: "accepted"; messageId: string }
  | { kind: "error"; permanent: boolean; httpStatus?: number }
  | { kind: "timeout_unknown" }

// ─── Client ───────────────────────────────────────────────────────────────────

export class CloudApiClient {
  private readonly apiVersion: string
  private readonly accessToken: string
  private readonly timeoutMs: number
  private readonly maxRetries: number

  constructor(accessToken: string, opts?: { timeoutMs?: number; maxRetries?: number }) {
    this.accessToken = accessToken
    this.apiVersion = process.env.META_GRAPH_API_VERSION ?? "v22.0"
    this.timeoutMs = opts?.timeoutMs ?? 10_000
    this.maxRetries = opts?.maxRetries ?? 2
  }

  async sendText(params: SendTextParams): Promise<SendOutcome> {
    return this.sendWithRetry(params.phoneNumberId, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "text",
      text: {
        body: params.text,
        preview_url: params.previewUrl ?? false,
      },
    })
  }

  async sendTemplate(params: SendTemplateParams): Promise<SendOutcome> {
    return this.sendWithRetry(params.phoneNumberId, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "template",
      template: {
        name: params.templateName,
        language: { code: params.languageCode },
        ...(params.components?.length ? { components: params.components } : {}),
      },
    })
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private async sendWithRetry(
    phoneNumberId: string,
    body: Record<string, unknown>,
  ): Promise<SendOutcome> {
    let lastOutcome: SendOutcome = { kind: "error", permanent: false }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(500 * Math.pow(2, attempt - 1)) // 500ms, 1s, 2s…
      }

      const outcome = await this.sendOnce(phoneNumberId, body)
      lastOutcome = outcome

      // Never retry on success, timeout, or permanent error
      if (outcome.kind === "accepted") return outcome
      if (outcome.kind === "timeout_unknown") return outcome
      if (outcome.kind === "error" && outcome.permanent) return outcome

      // Transient error: retry if attempts remain, otherwise fall through
    }
    return lastOutcome
  }

  private async sendOnce(
    phoneNumberId: string,
    body: Record<string, unknown>,
  ): Promise<SendOutcome> {
    const url = `${META_GRAPH_BASE}/${this.apiVersion}/${phoneNumberId}/messages`
    let res: Response

    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (err) {
      // AbortSignal.timeout() throws a DOMException with name "TimeoutError".
      // A timeout after dispatch means the request reached the network — Meta may
      // have received it. Treat as unknown, do not blindly retry.
      if (err instanceof Error && err.name === "TimeoutError") {
        return { kind: "timeout_unknown" }
      }
      // Network errors before dispatch (DNS, TCP) are transient.
      return { kind: "error", permanent: false }
    }

    if (!res.ok) {
      const permanent = await classifyErrorResponse(res)
      return { kind: "error", permanent, httpStatus: res.status }
    }

    const data = await res.json() as { messages?: Array<{ id: string }> }
    const messageId = data.messages?.[0]?.id

    if (!messageId) {
      // Unexpected 2xx without a wamid — treat as transient (may be a Meta rollout issue)
      return { kind: "error", permanent: false }
    }

    return { kind: "accepted", messageId }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function classifyErrorResponse(res: Response): Promise<boolean> {
  if (PERMANENT_HTTP_STATUSES.has(res.status)) return true

  try {
    const body = await res.json() as { error?: { code?: number } }
    if (body?.error?.code && PERMANENT_META_ERROR_CODES.has(body.error.code)) return true
  } catch {
    // Not JSON — classification stays based on HTTP status only
  }

  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Legacy error class (kept for backwards compatibility) ────────────────────

export class CloudApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message)
    this.name = "CloudApiError"
  }
}

import "server-only"

const META_GRAPH_BASE = "https://graph.facebook.com"

export type VerifyResult =
  | { ok: true; scopes: string[]; expiresAt: Date | null }
  | { ok: false; reason: "invalid_token" | "no_pixel_access" | "expired" | "network_error" | "unknown" }

/**
 * Verifies a Meta access token against the given pixel.
 * Returns structured result — never surfaces raw API error messages.
 */
export async function verifyMetaConnection(
  accessToken: string,
  pixelId: string,
  graphApiVersion?: string
): Promise<VerifyResult> {
  const apiVersion = graphApiVersion ?? process.env.META_GRAPH_API_VERSION ?? "v19.0"

  try {
    // 1. Validate that the token is active using GET /me
    // /me/permissions only works for User Access Tokens — System User tokens (the most
    // common type for CAPI, issued by Business Manager) return OAuthException on that
    // endpoint even when valid. /me?fields=id works for all token types.
    const meRes = await fetch(
      `${META_GRAPH_BASE}/${apiVersion}/me?fields=id&access_token=${accessToken}`,
      { cache: "no-store" }
    )
    if (!meRes.ok) {
      const err = await meRes.json().catch(() => ({})) as { error?: { code?: number; type?: string } }
      const code = err.error?.code
      if (code === 190) return { ok: false, reason: "expired" }
      if (
        code === 102 ||
        err.error?.type === "OAuthException" ||
        code === 2500 // Invalid access token
      ) {
        return { ok: false, reason: "invalid_token" }
      }
      return { ok: false, reason: "unknown" }
    }

    // 2. Optionally verify pixel read access; not required for CAPI send access.
    // Codes 100/200 = no pixel read permission (normal for System User tokens scoped only
    // for CAPI) — not a blocking error. Only block on token-level errors (190/102).
    const pixelRes = await fetch(
      `${META_GRAPH_BASE}/${apiVersion}/${pixelId}?fields=id&access_token=${accessToken}`,
      { cache: "no-store" }
    )
    if (!pixelRes.ok) {
      const err = await pixelRes.json().catch(() => ({})) as { error?: { code?: number; type?: string } }
      const code = err.error?.code
      if (code === 190) return { ok: false, reason: "expired" }
      if (code === 102 || err.error?.type === "OAuthException") return { ok: false, reason: "invalid_token" }
      // Ignore 100/200 — pixel read is not required for CAPI
    }

    return { ok: true, scopes: [], expiresAt: null }
  } catch {
    return { ok: false, reason: "network_error" }
  }
}

/**
 * Sends a test Lead event to Meta CAPI to confirm end-to-end delivery.
 * Uses META_TEST_EVENT_CODE env var when set (non-production safe).
 */
export async function sendTestLeadEvent(
  accessToken: string,
  pixelId: string,
  graphApiVersion?: string
): Promise<{ sent: boolean; status: string }> {
  const apiVersion = graphApiVersion ?? process.env.META_GRAPH_API_VERSION ?? "v19.0"
  const testEventCode = process.env.META_TEST_EVENT_CODE

  const event = {
    event_name: "Lead",
    event_time: Math.floor(Date.now() / 1000),
    event_id: `test_${crypto.randomUUID()}`,
    action_source: "website",
    user_data: {},
  }

  try {
    const body: Record<string, unknown> = { data: [event] }
    if (testEventCode) body.test_event_code = testEventCode

    const res = await fetch(`${META_GRAPH_BASE}/${apiVersion}/${pixelId}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })
    const json = await res.json() as { events_received?: number; error?: { code?: number } }
    if (!res.ok) {
      const code = json.error?.code
      if (code === 190 || code === 102) return { sent: false, status: "invalid_token" }
      return { sent: false, status: "api_error" }
    }
    return { sent: true, status: `sent:${json.events_received ?? 1}` }
  } catch {
    return { sent: false, status: "network_error" }
  }
}

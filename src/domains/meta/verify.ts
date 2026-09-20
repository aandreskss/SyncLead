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
    // Do NOT check err.error?.type === "OAuthException" here: Meta uses OAuthException
    // for permission errors (code 200) which are expected for CAPI-only tokens.
    // If step 1 (/me) passed, the token is valid — pixel errors are non-blocking.
    const pixelRes = await fetch(
      `${META_GRAPH_BASE}/${apiVersion}/${pixelId}?fields=id&access_token=${accessToken}`,
      { cache: "no-store" }
    )
    if (!pixelRes.ok) {
      const err = await pixelRes.json().catch(() => ({})) as { error?: { code?: number; type?: string } }
      const code = err.error?.code
      if (code === 190) return { ok: false, reason: "expired" }
      if (code === 102) return { ok: false, reason: "invalid_token" }
      // Ignore 100/200/OAuthException and all other errors — pixel read is not required for CAPI
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

  // Meta CAPI requires at least one user_data field — use a synthetic SHA-256 hash
  // of a fixed test address so the test event always passes validation.
  const emBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("test@synclead.test"))
  const emHash = Array.from(new Uint8Array(emBytes)).map(b => b.toString(16).padStart(2, "0")).join("")

  const event = {
    event_name: "Lead",
    event_time: Math.floor(Date.now() / 1000),
    event_id: `test_${crypto.randomUUID()}`,
    action_source: "website",
    user_data: { em: [emHash] },
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
    const json = await res.json() as { events_received?: number; error?: { code?: number; message?: string } }
    if (!res.ok) {
      const code = json.error?.code
      if (code === 190 || code === 102) return { sent: false, status: "invalid_token" }
      // Return the actual Meta error code so it appears in lastError and the UI
      return { sent: false, status: `api_error:${code ?? res.status}` }
    }
    return { sent: true, status: `sent:${json.events_received ?? 1}` }
  } catch {
    return { sent: false, status: "network_error" }
  }
}

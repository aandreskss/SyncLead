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
    // 1. Validate token + retrieve granted scopes
    const permRes = await fetch(
      `${META_GRAPH_BASE}/${apiVersion}/me/permissions?access_token=${accessToken}`,
      { cache: "no-store" }
    )
    if (!permRes.ok) {
      const err = await permRes.json().catch(() => ({})) as { error?: { code?: number; type?: string } }
      const code = err.error?.code
      if (code === 190 || code === 102 || err.error?.type === "OAuthException") {
        return { ok: false, reason: "invalid_token" }
      }
      return { ok: false, reason: "unknown" }
    }
    const permData = await permRes.json() as {
      data?: Array<{ permission: string; status: string }>
    }
    const scopes = (permData.data ?? [])
      .filter((p) => p.status === "granted")
      .map((p) => p.permission)

    // 2. Verify this token has read access to the specified pixel
    const pixelRes = await fetch(
      `${META_GRAPH_BASE}/${apiVersion}/${pixelId}?fields=id,name&access_token=${accessToken}`,
      { cache: "no-store" }
    )
    if (!pixelRes.ok) {
      const err = await pixelRes.json().catch(() => ({})) as { error?: { code?: number } }
      const code = err.error?.code
      if (code === 190) return { ok: false, reason: "expired" }
      if (code === 100 || code === 200) return { ok: false, reason: "no_pixel_access" }
      return { ok: false, reason: "unknown" }
    }

    return { ok: true, scopes, expiresAt: null }
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

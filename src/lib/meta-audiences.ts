import "server-only"
import { createHash } from "crypto"

const META_GRAPH_BASE = "https://graph.facebook.com"

function getApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION ?? "v19.0"
}

function sha256hex(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex")
}

export type AudienceUser = {
  email?: string | null
  phone?: string | null
}

export type CreateAudienceResult = { audienceId: string } | { error: string }
export type SyncAudienceResult = { memberCount: number; status: string } | { error: string }
export type AudienceStatsResult = { memberCount: number } | { error: string }

export async function createCustomAudience(
  adAccountId: string,
  accessToken: string,
  name: string,
  description: string
): Promise<CreateAudienceResult> {
  const v = getApiVersion()
  try {
    const res = await fetch(
      `${META_GRAPH_BASE}/${v}/act_${adAccountId}/customaudiences`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          name,
          subtype: "CUSTOM",
          customer_file_source: "USER_PROVIDED_ONLY",
          description,
        }),
        signal: AbortSignal.timeout(15_000),
      }
    )
    const json = await res.json() as { id?: string; error?: { code?: number; message?: string } }
    if (!res.ok || !json.id) {
      return { error: `api_${json.error?.code ?? "unknown"}` }
    }
    return { audienceId: json.id }
  } catch {
    return { error: "network_error" }
  }
}

export async function syncUsersToAudience(
  audienceId: string,
  accessToken: string,
  users: AudienceUser[]
): Promise<SyncAudienceResult> {
  if (users.length === 0) return { memberCount: 0, status: "empty" }

  const v = getApiVersion()
  const sessionId = Math.floor(Date.now() / 1000)

  const data = users
    .map((u) => [
      u.email ? sha256hex(u.email) : "",
      u.phone ? sha256hex(u.phone.replace(/\D/g, "")) : "",
    ])
    .filter(([em, ph]) => em !== "" || ph !== "")

  if (data.length === 0) return { memberCount: 0, status: "no_valid_users" }

  try {
    const res = await fetch(`${META_GRAPH_BASE}/${v}/${audienceId}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        payload: { schema: ["EMAIL", "PHONE"], data },
        session: {
          session_id: sessionId,
          batch_seq: 1,
          last_batch_seq: 1,
          estimated_num_total: data.length,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    })
    const json = await res.json() as { num_received?: number; num_invalid_entries?: number; error?: { code?: number } }
    if (!res.ok) return { error: `api_${json.error?.code ?? "unknown"}` }
    const received = json.num_received ?? data.length
    const invalid = json.num_invalid_entries ?? 0
    return { memberCount: received - invalid, status: `synced:${received - invalid}` }
  } catch {
    return { error: "network_error" }
  }
}

export async function getAudienceStats(
  audienceId: string,
  accessToken: string
): Promise<AudienceStatsResult> {
  const v = getApiVersion()
  try {
    const res = await fetch(
      `${META_GRAPH_BASE}/${v}/${audienceId}?fields=approximate_count_lower_bound,approximate_count_upper_bound`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      }
    )
    const json = await res.json() as {
      approximate_count_lower_bound?: number
      approximate_count_upper_bound?: number
      error?: { code?: number }
    }
    if (!res.ok) return { error: `api_${json.error?.code ?? "unknown"}` }
    const count = json.approximate_count_lower_bound ?? 0
    return { memberCount: count }
  } catch {
    return { error: "network_error" }
  }
}

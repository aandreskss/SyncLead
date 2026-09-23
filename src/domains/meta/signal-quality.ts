import "server-only"

const META_GRAPH_BASE = "https://graph.facebook.com"

function getApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION ?? "v19.0"
}

export type EventSignalQuality = {
  eventName: string
  score: number | null
}

export type SignalQualityResult =
  | { events: EventSignalQuality[] }
  | { error: string }

export async function getCapiSignalQuality(
  pixelId: string,
  accessToken: string
): Promise<SignalQualityResult> {
  const v = getApiVersion()
  try {
    const res = await fetch(
      `${META_GRAPH_BASE}/${v}/${pixelId}?fields=signal_quality_reporting`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      }
    )
    const json = await res.json() as {
      signal_quality_reporting?: Array<{
        event_name: string
        event_match_quality?: { composite_score?: number; weighted_score?: number }
      }>
      error?: { code?: number }
    }

    if (!res.ok) return { error: `api_${json.error?.code ?? "unknown"}` }

    const events: EventSignalQuality[] = (json.signal_quality_reporting ?? []).map((e) => ({
      eventName: e.event_name,
      score: e.event_match_quality?.composite_score ?? e.event_match_quality?.weighted_score ?? null,
    }))

    return { events }
  } catch {
    return { error: "network_error" }
  }
}

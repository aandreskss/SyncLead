import "server-only"

const META_GRAPH_BASE = "https://graph.facebook.com"
const DEFAULT_API_VERSION = "v19.0"
const MAX_RETRIES = 3

export interface AdInsightRow {
  campaign_id?: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
  ad_id?: string
  ad_name?: string
  date_start: string
  impressions: string
  clicks: string
  spend: string
  reach?: string
  actions?: Array<{ action_type: string; value: string }>
}

export interface MetaCampaignRow {
  id: string
  name: string
  status: string
  effective_status: string
  objective?: string
  start_time?: string
  stop_time?: string
  daily_budget?: string
  lifetime_budget?: string
}

export interface MetaAdsetRow {
  id: string
  campaign_id: string
  name: string
  status: string
  effective_status: string
  targeting?: Record<string, unknown>
}

export interface MetaAdRow {
  id: string
  adset_id: string
  campaign_id: string
  name: string
  status: string
  effective_status: string
  creative?: { name?: string }
}

export interface MetaAdsClientOptions {
  accessToken: string
  adAccountId: string
  apiVersion?: string
}

// Codes that are permanent failures (no retry benefit)
const PERMANENT_ERROR_CODES = new Set([190, 102, 200, 273, 100])
// Codes that indicate rate limiting (back off and retry)
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613])

function normalizeAccountId(raw: string): string {
  return raw.startsWith("act_") ? raw : `act_${raw}`
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const msg = err instanceof Error ? err.message : ""
      // Extract error code from message like "meta_api_error:613"
      const code = parseInt(msg.split(":")[1] ?? "0", 10)
      if (PERMANENT_ERROR_CODES.has(code)) throw err
      // Exponential backoff with ±20% jitter
      const base = 1000 * Math.pow(2, attempt)
      const jitter = base * 0.2 * (Math.random() * 2 - 1)
      await new Promise((r) => setTimeout(r, Math.max(0, base + jitter)))
      if (RATE_LIMIT_CODES.has(code)) {
        // Extra wait for rate limit
        await new Promise((r) => setTimeout(r, 5000))
      }
    }
  }
  throw lastError
}

export class MetaAdsClient {
  readonly accountId: string
  private readonly token: string
  private readonly apiVersion: string
  private readonly baseUrl: string

  constructor(opts: MetaAdsClientOptions) {
    this.token = opts.accessToken
    this.accountId = normalizeAccountId(opts.adAccountId)
    this.apiVersion = opts.apiVersion ?? process.env.META_GRAPH_API_VERSION ?? DEFAULT_API_VERSION
    this.baseUrl = `${META_GRAPH_BASE}/${this.apiVersion}`
  }

  async verifyAdsAccess(): Promise<{ ok: boolean; hasAdsRead: boolean; currency?: string; error?: string }> {
    try {
      const [permRes, accountRes] = await Promise.all([
        fetch(`${this.baseUrl}/me/permissions?access_token=${this.token}`, { cache: "no-store" }),
        fetch(`${this.baseUrl}/${this.accountId}?fields=id,currency&access_token=${this.token}`, { cache: "no-store" }),
      ])

      if (!permRes.ok) return { ok: false, hasAdsRead: false, error: "invalid_token" }

      const permData = await permRes.json() as { data?: Array<{ permission: string; status: string }> }
      const granted = new Set(
        (permData.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission)
      )

      if (!accountRes.ok) {
        const err = await accountRes.json().catch(() => ({})) as { error?: { code?: number } }
        const code = err.error?.code
        const reason = code === 190 ? "invalid_token" : "no_account_access"
        return { ok: false, hasAdsRead: granted.has("ads_read"), error: reason }
      }

      const accountData = await accountRes.json() as { currency?: string }
      return { ok: true, hasAdsRead: granted.has("ads_read"), currency: accountData.currency }
    } catch {
      return { ok: false, hasAdsRead: false, error: "network_error" }
    }
  }

  async getInsights(params: {
    dateFrom: string
    dateTo: string
    level: "campaign" | "adset" | "ad"
  }): Promise<AdInsightRow[]> {
    return withRetry(() => {
      const fields = [
        "campaign_id", "campaign_name",
        "adset_id", "adset_name",
        "ad_id", "ad_name",
        "date_start", "impressions", "clicks", "spend", "reach", "actions",
      ]
      const url = new URL(`${this.baseUrl}/${this.accountId}/insights`)
      url.searchParams.set("access_token", this.token)
      url.searchParams.set("level", params.level)
      url.searchParams.set("time_range", JSON.stringify({ since: params.dateFrom, until: params.dateTo }))
      url.searchParams.set("time_increment", "1")
      url.searchParams.set("fields", fields.join(","))
      url.searchParams.set("limit", "500")
      return this.fetchPaged<AdInsightRow>(url.toString())
    })
  }

  async getCampaigns(): Promise<MetaCampaignRow[]> {
    return withRetry(() => {
      const fields = "id,name,status,effective_status,objective,start_time,stop_time,daily_budget,lifetime_budget"
      return this.fetchPaged<MetaCampaignRow>(
        `${this.baseUrl}/${this.accountId}/campaigns?fields=${fields}&limit=200&access_token=${this.token}`
      )
    })
  }

  async getAdsets(): Promise<MetaAdsetRow[]> {
    return withRetry(() => {
      const fields = "id,campaign_id,name,status,effective_status,targeting"
      return this.fetchPaged<MetaAdsetRow>(
        `${this.baseUrl}/${this.accountId}/adsets?fields=${fields}&limit=200&access_token=${this.token}`
      )
    })
  }

  async getAds(): Promise<MetaAdRow[]> {
    return withRetry(() => {
      const fields = "id,adset_id,campaign_id,name,status,effective_status,creative{name}"
      return this.fetchPaged<MetaAdRow>(
        `${this.baseUrl}/${this.accountId}/ads?fields=${fields}&limit=500&access_token=${this.token}`
      )
    })
  }

  private async fetchPaged<T>(url: string): Promise<T[]> {
    const results: T[] = []
    let cursor: string | null = url

    while (cursor) {
      const res = await fetch(cursor, { cache: "no-store" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { code?: number } }
        throw new Error(`meta_api_error:${err.error?.code ?? res.status}`)
      }
      const data = await res.json() as {
        data: T[]
        paging?: { next?: string }
      }
      results.push(...data.data)
      cursor = data.paging?.next ?? null
    }

    return results
  }
}

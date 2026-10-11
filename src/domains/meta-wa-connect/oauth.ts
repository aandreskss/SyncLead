import "server-only"
import { createHmac, timingSafeEqual } from "crypto"
import type { MetaTokenResponse, MetaTokenDebugInfo, MetaWabaInfo, MetaPhoneNumberInfo, EmbeddedSignupData } from "./types"

const GRAPH_BASE = "https://graph.facebook.com"
const API_VERSION = "v22.0"
const REQUIRED_SCOPES = ["whatsapp_business_management", "whatsapp_business_messaging"]
const OAUTH_SCOPES = [...REQUIRED_SCOPES, "business_management"].join(",")

function appId() {
  const id = process.env.META_WA_APP_ID
  if (!id) throw new Error("META_WA_APP_ID not configured")
  return id
}

function appSecret() {
  const s = process.env.WA_CLOUD_APP_SECRET
  if (!s) throw new Error("WA_CLOUD_APP_SECRET not configured")
  return s
}

function redirectUri() {
  const uri = process.env.META_WA_REDIRECT_URI
    ?? (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/api/wa-connect/callback` : undefined)
  if (!uri) throw new Error("META_WA_REDIRECT_URI or NEXT_PUBLIC_APP_URL not configured")
  return uri
}

/** appsecret_proof = HMAC-SHA256(app_secret, access_token) for server-side Graph API calls */
function appSecretProof(accessToken: string): string {
  return createHmac("sha256", appSecret()).update(accessToken).digest("hex")
}

/** Build the Meta OAuth URL to redirect the user to */
export function buildOAuthUrl(stateId: string): string {
  const configId = process.env.META_WA_CONFIG_ID

  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri(),
    state: stateId,
    scope: OAUTH_SCOPES,
    response_type: "code",
  })

  if (configId) {
    // Embedded Signup: Meta returns a signed_request alongside the code
    params.set("config_id", configId)
    params.set("override_default_response_type", "true")
    params.set("extras", JSON.stringify({ setup: {}, featuretype: "whatsapp_embedded_signup" }))
  }

  return `https://www.facebook.com/dialog/oauth?${params.toString()}`
}

/** Exchange authorization code for a short-lived user access token */
export async function exchangeCodeForToken(code: string): Promise<MetaTokenResponse> {
  const url = new URL(`${GRAPH_BASE}/${API_VERSION}/oauth/access_token`)
  url.searchParams.set("client_id", appId())
  url.searchParams.set("client_secret", appSecret())
  url.searchParams.set("redirect_uri", redirectUri())
  url.searchParams.set("code", code)

  const res = await fetch(url.toString(), { method: "POST", cache: "no-store" })
  const data = await res.json() as MetaTokenResponse & { error?: { message: string; code: number } }

  if (!res.ok || data.error || !data.access_token) {
    const msg = data.error?.message ?? "Unknown error from Meta token exchange"
    throw Object.assign(new Error(msg), { metaCode: data.error?.code })
  }
  return data
}

/** Exchange short-lived user token for long-lived token (60 days) */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<MetaTokenResponse> {
  const url = new URL(`${GRAPH_BASE}/${API_VERSION}/oauth/access_token`)
  url.searchParams.set("grant_type", "fb_exchange_token")
  url.searchParams.set("client_id", appId())
  url.searchParams.set("client_secret", appSecret())
  url.searchParams.set("fb_exchange_token", shortLivedToken)
  url.searchParams.set("appsecret_proof", appSecretProof(shortLivedToken))

  const res = await fetch(url.toString(), { cache: "no-store" })
  const data = await res.json() as MetaTokenResponse & { error?: { message: string; code: number } }

  if (!res.ok || data.error || !data.access_token) {
    const msg = data.error?.message ?? "Long-lived token exchange failed"
    throw Object.assign(new Error(msg), { metaCode: data.error?.code })
  }
  return data
}

/** Inspect token to get granted scopes and validity */
export async function inspectToken(userToken: string): Promise<MetaTokenDebugInfo> {
  const appToken = `${appId()}|${appSecret()}`
  const url = new URL(`${GRAPH_BASE}/${API_VERSION}/debug_token`)
  url.searchParams.set("input_token", userToken)
  url.searchParams.set("access_token", appToken)

  const res = await fetch(url.toString(), { cache: "no-store" })
  const data = await res.json() as { data?: MetaTokenDebugInfo; error?: { message: string } }

  if (!res.ok || data.error || !data.data) {
    throw new Error(data.error?.message ?? "Token inspection failed")
  }
  return data.data
}

/** Check if all required scopes are present */
export function hasRequiredScopes(grantedScopes: string[]): boolean {
  return REQUIRED_SCOPES.every(s => grantedScopes.includes(s))
}

/** Retrieve WABA info by WABA ID using the user's access token */
export async function fetchWabaInfo(wabaId: string, accessToken: string): Promise<MetaWabaInfo | null> {
  const url = new URL(`${GRAPH_BASE}/${API_VERSION}/${wabaId}`)
  url.searchParams.set("fields", "id,name,account_review_status,country,currency")
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("appsecret_proof", appSecretProof(accessToken))

  const res = await fetch(url.toString(), { cache: "no-store" })
  const data = await res.json() as MetaWabaInfo & { error?: { message: string; code: number } }

  if (!res.ok || data.error) {
    if (data.error?.code === 100 || data.error?.code === 200) {
      return null // Not authorized for this WABA
    }
    throw Object.assign(new Error(data.error?.message ?? "WABA fetch failed"), { metaCode: data.error?.code })
  }
  return data
}

/** Retrieve phone numbers for a WABA */
export async function fetchPhoneNumbers(wabaId: string, accessToken: string): Promise<MetaPhoneNumberInfo[]> {
  const url = new URL(`${GRAPH_BASE}/${API_VERSION}/${wabaId}/phone_numbers`)
  url.searchParams.set("fields", "id,display_phone_number,verified_name,quality_rating,status")
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("appsecret_proof", appSecretProof(accessToken))

  const res = await fetch(url.toString(), { cache: "no-store" })
  const data = await res.json() as { data?: MetaPhoneNumberInfo[]; error?: { message: string; code: number } }

  if (!res.ok || data.error) {
    throw Object.assign(new Error(data.error?.message ?? "Phone numbers fetch failed"), { metaCode: data.error?.code })
  }
  return data.data ?? []
}

/** Discover all WABAs accessible with this token.
 *  Strategy 1: via Business Manager (requires business_management scope + BM setup)
 *  Strategy 2: direct /me/whatsapp_business_accounts (works without BM)
 */
export async function discoverWabas(accessToken: string): Promise<MetaWabaInfo[]> {
  // Strategy 1 (two-step): get businesses first, then query WABAs per business
  try {
    const bizUrl = new URL(`${GRAPH_BASE}/${API_VERSION}/me/businesses`)
    bizUrl.searchParams.set("fields", "id,name")
    bizUrl.searchParams.set("access_token", accessToken)
    bizUrl.searchParams.set("appsecret_proof", appSecretProof(accessToken))

    const bizRes = await fetch(bizUrl.toString(), { cache: "no-store" })
    const bizData = await bizRes.json() as {
      data?: Array<{ id: string; name: string }>
      error?: { message: string; code: number }
    }

    console.log("[discoverWabas] s1 businesses status:", bizRes.status, "count:", bizData.data?.length ?? 0, "error:", bizData.error ?? null)

    if (bizRes.ok && !bizData.error && bizData.data && bizData.data.length > 0) {
      const allWabas: MetaWabaInfo[] = []
      for (const biz of bizData.data) {
        const wabaUrl = new URL(`${GRAPH_BASE}/${API_VERSION}/${biz.id}/whatsapp_business_accounts`)
        wabaUrl.searchParams.set("fields", "id,name,account_review_status")
        wabaUrl.searchParams.set("access_token", accessToken)
        wabaUrl.searchParams.set("appsecret_proof", appSecretProof(accessToken))

        const wabaRes = await fetch(wabaUrl.toString(), { cache: "no-store" })
        const wabaData = await wabaRes.json() as { data?: MetaWabaInfo[]; error?: { message: string; code: number } }

        console.log("[discoverWabas] s1 biz", biz.id, "wabas status:", wabaRes.status, "count:", wabaData.data?.length ?? 0, "error:", wabaData.error ?? null)

        if (wabaRes.ok && !wabaData.error && wabaData.data) {
          allWabas.push(...wabaData.data)
        }
      }
      if (allWabas.length > 0) return allWabas
    }
  } catch (err) {
    console.error("[discoverWabas] s1 threw:", err)
  }

  // Strategy 2: via owned_whatsapp_business_accounts (business API endpoint)
  try {
    const url2 = new URL(`${GRAPH_BASE}/${API_VERSION}/me`)
    url2.searchParams.set("fields", "businesses{whatsapp_business_accounts{id,name,account_review_status}}")
    url2.searchParams.set("access_token", accessToken)
    url2.searchParams.set("appsecret_proof", appSecretProof(accessToken))

    const res2 = await fetch(url2.toString(), { cache: "no-store" })
    const data2 = await res2.json() as {
      businesses?: { data?: Array<{ whatsapp_business_accounts?: { data?: MetaWabaInfo[] } }> }
      error?: { message: string; code: number }
    }

    console.log("[discoverWabas] s2 status:", res2.status, "error:", data2.error ?? null)

    if (res2.ok && !data2.error && data2.businesses?.data) {
      const wabas = data2.businesses.data.flatMap(b => b.whatsapp_business_accounts?.data ?? [])
      console.log("[discoverWabas] s2 wabas:", wabas.length)
      if (wabas.length > 0) return wabas
    }
  } catch (err) {
    console.error("[discoverWabas] s2 threw:", err)
  }

  // Strategy 3: direct user WABA list (works if WABA is owned directly, not via BM)
  const url3 = new URL(`${GRAPH_BASE}/${API_VERSION}/me/businesses`)
  url3.searchParams.set("fields", "id,name,whatsapp_business_accounts{id,name,account_review_status}")
  url3.searchParams.set("access_token", accessToken)
  url3.searchParams.set("appsecret_proof", appSecretProof(accessToken))

  const res3 = await fetch(url3.toString(), { cache: "no-store" })
  const data3 = await res3.json() as {
    data?: Array<{ id: string; name: string; whatsapp_business_accounts?: { data?: MetaWabaInfo[] } }>
    error?: { message: string; code: number }
  }

  console.log("[discoverWabas] s3 status:", res3.status, "error:", data3.error ?? null, "data:", JSON.stringify(data3.data ?? []))

  if (!res3.ok || data3.error) {
    throw Object.assign(new Error(data3.error?.message ?? "WABA discovery failed"), { metaCode: data3.error?.code })
  }

  const wabas3 = data3.data?.flatMap(b => b.whatsapp_business_accounts?.data ?? []) ?? []
  return wabas3
}

/**
 * Parse the Embedded Signup signed_request callback parameter.
 * signed_request = base64url(signature).base64url(payload)
 * where signature = HMAC-SHA256(app_secret, payload)
 */
export function parseSignedRequest(signedRequest: string): EmbeddedSignupData | null {
  try {
    const [sigPart, payloadPart] = signedRequest.split(".")
    if (!sigPart || !payloadPart) return null

    const expectedSig = createHmac("sha256", appSecret())
      .update(payloadPart)
      .digest("base64url")

    // Timing-safe compare
    if (sigPart.length !== expectedSig.length) return null
    if (!timingSafeEqual(Buffer.from(sigPart), Buffer.from(expectedSig))) return null

    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf-8")) as {
      waba_id?: string
      phone_number_id?: string
    }

    if (!payload.waba_id) return null

    return {
      wabaId: payload.waba_id,
      phoneNumberId: payload.phone_number_id,
    }
  } catch {
    return null
  }
}

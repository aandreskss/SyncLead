import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  inspectToken,
  hasRequiredScopes,
  fetchWabaInfo,
  fetchPhoneNumbers,
  discoverWabas,
  parseSignedRequest,
} from "@/domains/meta-wa-connect/oauth"
import { subscribeWabaToApp } from "@/domains/meta-wa-connect/webhook-subscription"
import {
  consumeOauthState,
  storeOrUpdateConnection,
} from "@/domains/meta-wa-connect/repository"
import type { WaConnectionStatus } from "@/domains/meta-wa-connect/types"

export const dynamic = "force-dynamic"

function errorRedirect(request: Request, code: string, returnPath?: string): NextResponse {
  const dest = new URL(returnPath ?? "/dashboard/settings/channels", request.url)
  dest.searchParams.set("wa_error", code)
  return NextResponse.redirect(dest)
}

function successRedirect(request: Request, returnPath: string): NextResponse {
  const dest = new URL(returnPath, request.url)
  dest.searchParams.set("wa_success", "1")
  return NextResponse.redirect(dest)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const stateId = searchParams.get("state")
  const error = searchParams.get("error")
  const signedRequest = searchParams.get("signed_request")

  // User cancelled on Meta's side
  if (error || !code || !stateId) {
    return errorRedirect(request, error === "access_denied" ? "user_cancelled" : "missing_params")
  }

  // Validate session
  let ctx: Awaited<ReturnType<typeof requireRole>>
  try {
    ctx = await requireRole(["owner", "admin"])
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) {
      return NextResponse.redirect(new URL(`/auth/login?callbackUrl=${encodeURIComponent(request.url)}`, request.url))
    }
    throw e
  }

  // Consume CSRF state (one-time use)
  const stateResult = await consumeOauthState(stateId)
  if (!stateResult.ok) {
    return errorRedirect(request, `state_${stateResult.reason}`)
  }

  // Org isolation: state must belong to the authenticated org
  if (stateResult.orgId !== ctx.orgId) {
    return errorRedirect(request, "org_mismatch", stateResult.returnPath)
  }

  const returnPath = stateResult.returnPath
  const wabaIdHint = stateResult.wabaIdHint

  // Exchange code for token
  let shortToken: string
  try {
    const tokenResponse = await exchangeCodeForToken(code)
    shortToken = tokenResponse.access_token
  } catch {
    return errorRedirect(request, "token_exchange_failed", returnPath)
  }

  // Exchange for long-lived token
  let longToken: string
  let tokenExpiresAt: Date | undefined
  try {
    const longResponse = await exchangeForLongLivedToken(shortToken)
    longToken = longResponse.access_token
    if (longResponse.expires_in) {
      tokenExpiresAt = new Date(Date.now() + longResponse.expires_in * 1000)
    }
  } catch {
    // Non-fatal: continue with short-lived token
    longToken = shortToken
  }

  // Inspect token for granted scopes
  let grantedScopes: string[] = []
  try {
    const debugInfo = await inspectToken(longToken)
    if (!debugInfo.is_valid) {
      return errorRedirect(request, "token_exchange_failed", returnPath)
    }
    grantedScopes = debugInfo.scopes
  } catch {
    // Non-fatal: proceed without scope verification
  }

  const pendingReview = !hasRequiredScopes(grantedScopes) && grantedScopes.length > 0
  const connectionStatus: WaConnectionStatus =
    grantedScopes.length === 0
      ? "active" // Could not verify scopes — optimistically assume active
      : pendingReview
      ? "pending_review"
      : "active"

  // Discover WABA
  // Priority: 1. signed_request (Embedded Signup), 2. API discovery
  let wabaId: string | null = null
  let wabaName = "WhatsApp Business Account"

  // Priority 1: signed_request from Embedded Signup (META_WA_CONFIG_ID set)
  if (signedRequest) {
    const parsed = parseSignedRequest(signedRequest)
    if (parsed) wabaId = parsed.wabaId
  }

  // Priority 2: manually provided WABA ID hint (user entered it in the UI)
  if (!wabaId && wabaIdHint) {
    wabaId = wabaIdHint
    console.log("[wa-connect/callback] using wabaIdHint:", wabaId)
  }

  // Priority 3: API discovery (two strategies)
  if (!wabaId) {
    try {
      console.log("[wa-connect/callback] starting discoverWabas...")
      const wabas = await discoverWabas(longToken)
      console.log("[wa-connect/callback] discoverWabas result:", JSON.stringify(wabas))
      if (wabas.length === 0) {
        console.error("[wa-connect/callback] discoverWabas returned 0 WABAs")
        return errorRedirect(request, "waba_not_found", returnPath)
      }
      if (wabas.length > 1) {
        return errorRedirect(request, "multiple_wabas_use_embedded_signup", returnPath)
      }
      wabaId = wabas[0]!.id
      wabaName = wabas[0]!.name
    } catch (err) {
      console.error("[wa-connect/callback] discoverWabas threw:", err)
      return errorRedirect(request, "waba_not_found", returnPath)
    }
  }

  // Fetch WABA info (verify we're authorized for it)
  try {
    const wabaInfo = await fetchWabaInfo(wabaId, longToken)
    if (!wabaInfo) {
      return errorRedirect(request, "waba_unauthorized", returnPath)
    }
    wabaName = wabaInfo.name
  } catch {
    return errorRedirect(request, "waba_unauthorized", returnPath)
  }

  // Fetch phone numbers
  let phoneNumbers: Awaited<ReturnType<typeof fetchPhoneNumbers>> = []
  try {
    phoneNumbers = await fetchPhoneNumbers(wabaId, longToken)
  } catch {
    // Non-fatal: proceed without phone numbers (they'll appear after first webhook)
  }

  // Subscribe app to WABA webhooks
  try {
    await subscribeWabaToApp(wabaId, longToken)
  } catch {
    // Non-fatal for pending_review (scopes not yet granted)
  }

  // Store connection
  const storeResult = await storeOrUpdateConnection({
    orgId: ctx.orgId,
    wabaId,
    wabaName,
    accessToken: longToken,
    scopes: grantedScopes,
    tokenExpiresAt,
    connectionMode: "embedded_signup",
    connectionStatus,
    phoneNumbers: phoneNumbers.map(p => ({
      phoneNumberId: p.id,
      displayPhoneNumber: p.display_phone_number,
      verifiedName: p.verified_name,
      qualityRating: p.quality_rating,
      status: p.status ?? "active",
    })),
  })

  if (!storeResult.ok) {
    return errorRedirect(request, "number_conflict", returnPath)
  }

  return successRedirect(request, returnPath)
}

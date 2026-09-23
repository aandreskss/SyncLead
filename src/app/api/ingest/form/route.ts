import { NextRequest, NextResponse } from "next/server"
import { Ratelimit } from "@upstash/ratelimit"
import { getRedis } from "@/lib/redis"
import { FormPayloadSchema, MAX_BODY_BYTES } from "@/lib/ingest/schema"
import { lookupCredential } from "@/lib/ingest/lookup"
import { normalizeLeadData, extractTrustedIp, extractTrustedUserAgent, anonymizeIp, isOriginAllowed } from "@/lib/ingest/normalize"
import { verifyTurnstile, checkHoneypot, checkSubmitTime } from "@/lib/ingest/bot"
import { persistLead } from "@/lib/ingest/persist"
import { logIngestError } from "@/lib/ingest/errors"
import { db } from "@/lib/db"
import { campaigns } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

// ─── Rate limiter: 20 submissions per token+anonIP per minute ────────────────
let ratelimit: Ratelimit | null = null
const redis = getRedis()
if (redis) {
  ratelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "1 m"), prefix: "sl:form" })
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const allowOrigin =
    !origin ? "*"
    : allowed.length === 0 || allowed.includes(origin) ? origin
    : "null"
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Ingest-Token",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  }
}

function publicError(correlationId: string, status: number) {
  return NextResponse.json(
    { error: "Request could not be processed", correlationId },
    { status }
  )
}

// Silent 200 for bot rejections — avoids teaching bots which check failed
function silentSuccess(correlationId: string) {
  return NextResponse.json({ success: true, correlationId }, { status: 200 })
}

// ─── CORS pre-flight ──────────────────────────────────────────────────────────

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin")
  const token = req.headers.get("x-ingest-token") ?? ""
  const cred = await lookupCredential(token)
  const allowed = cred?.allowedOrigins ?? []
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin, allowed) })
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID()
  const origin = req.headers.get("origin")

  // ─ 1. Size guard ──────────────────────────────────────────────────────────────
  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10)
  if (contentLength > MAX_BODY_BYTES) return publicError(correlationId, 413)

  // ─ 2. Content-Type guard ──────────────────────────────────────────────────────
  const ct = (req.headers.get("content-type") ?? "").toLowerCase()
  if (!ct.includes("application/json") && !ct.includes("application/x-www-form-urlencoded") && !ct.includes("multipart/form-data")) {
    return publicError(correlationId, 415)
  }

  // ─ 3. Public token (never a server secret) ───────────────────────────────────
  const token = req.headers.get("x-ingest-token") ?? ""
  if (!token) return publicError(correlationId, 400)

  // ─ 4. Resolve credential (public_form type only) ─────────────────────────────
  const cred = await lookupCredential(token)
  if (!cred || cred.credentialType !== "public_form") return publicError(correlationId, 401)

  // For client-scoped credentials, resolve campaign: prefer body.campaign_id,
  // then fall back to first active campaign for the client.
  let resolvedCampaignId = cred.campaignId
  if (!resolvedCampaignId) {
    // Body not yet parsed — resolve after Zod parse below; set a sentinel for now.
    resolvedCampaignId = null
  }
  if (cred.campaignId && !cred.campaignActive) return publicError(correlationId, 403)

  // ─ 5. Origin validation ───────────────────────────────────────────────────────
  if (!isOriginAllowed(origin, cred.allowedOrigins)) {
    return NextResponse.json(
      { error: "Origin not allowed", correlationId },
      { status: 403, headers: corsHeaders(origin, cred.allowedOrigins) }
    )
  }

  // ─ 6. IP extraction and rate limiting ────────────────────────────────────────
  const realIp = extractTrustedIp(req)
  const anonIp = anonymizeIp(realIp)
  if (ratelimit && anonIp) {
    const key = `${cred.credentialId}:${anonIp}`
    const { success } = await ratelimit.limit(key)
    if (!success) return publicError(correlationId, 429)
  }

  // ─ 7. Parse body ──────────────────────────────────────────────────────────────
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return publicError(correlationId, 400)
  }

  // Reject if body is larger than limit (content-length can be spoofed)
  if (JSON.stringify(rawBody).length > MAX_BODY_BYTES) return publicError(correlationId, 413)

  // ─ 8. Zod validation ──────────────────────────────────────────────────────────
  const parsed = FormPayloadSchema.safeParse(rawBody)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    logIngestError({
      orgId: cred.orgId,
      campaignId: cred.campaignId ?? resolvedCampaignId ?? "unknown",
      clientId: cred.clientId,
      source: "form",
      errorType: "validation_error",
      zodError: parsed.error,
    })
    return NextResponse.json(
      { error: issue?.message ?? "Invalid payload", correlationId },
      { status: 400, headers: corsHeaders(origin, cred.allowedOrigins) }
    )
  }

  const payload = parsed.data

  // ─ 9. Resolve campaign for client-scoped credentials ─────────────────────────
  if (!resolvedCampaignId) {
    const body = rawBody as Record<string, unknown>

    // Priority 1: explicit campaign_id from body (data-campaign attribute on the script tag)
    const bodyCampaignId = body?.campaign_id as string | undefined
    if (bodyCampaignId) {
      const bodycamp = await db.query.campaigns.findFirst({
        where: and(eq(campaigns.id, bodyCampaignId), eq(campaigns.orgId, cred.orgId), eq(campaigns.clientId, cred.clientId)),
        columns: { id: true, active: true },
      })
      if (bodycamp) resolvedCampaignId = bodycamp.id
    }

    // Priority 2: UTM campaign key matching (utm_campaign from pixel → campaigns.utm_campaign_key)
    if (!resolvedCampaignId) {
      const utmCampaign = payload.utm_campaign?.trim().toLowerCase()
      if (utmCampaign) {
        const utmMatch = await db.query.campaigns.findFirst({
          where: and(
            eq(campaigns.clientId, cred.clientId),
            eq(campaigns.orgId, cred.orgId),
            eq(campaigns.utmCampaignKey, utmCampaign),
            eq(campaigns.active, true),
          ),
          columns: { id: true },
        })
        if (utmMatch) resolvedCampaignId = utmMatch.id
      }
    }

    // Priority 3: fallback to first active campaign for the client (organic / direct traffic)
    if (!resolvedCampaignId) {
      const fallback = await db.query.campaigns.findFirst({
        where: and(eq(campaigns.clientId, cred.clientId), eq(campaigns.orgId, cred.orgId), eq(campaigns.active, true)),
        columns: { id: true },
        orderBy: (t, { asc }) => [asc(t.createdAt)],
      })
      if (fallback) resolvedCampaignId = fallback.id
    }

    if (!resolvedCampaignId) return publicError(correlationId, 422)
  }

  // ─ 10. Bot protection ──────────────────────────────────────────────────────────
  if (!checkHoneypot(payload._hp)) return silentSuccess(correlationId)
  if (!checkSubmitTime(payload._t)) return silentSuccess(correlationId)

  const turnstileOk = await verifyTurnstile(payload["cf-turnstile-response"], realIp)
  if (!turnstileOk) return silentSuccess(correlationId)

  // ─ 11. Normalize ──────────────────────────────────────────────────────────────
  const normalizedLead = normalizeLeadData(payload)
  const userAgent = extractTrustedUserAgent(req)

  // ─ 12. Persist ────────────────────────────────────────────────────────────────
  const result = await persistLead({
    credential: { credentialId: cred.credentialId, orgId: cred.orgId, campaignId: resolvedCampaignId! },
    lead: normalizedLead,
    ip: realIp,
    userAgent,
    source: "form",
  })

  if (result.kind === "error") {
    console.error("[ingest/form] persist failed:", result.internalCode, correlationId)
    return publicError(correlationId, 500)
  }

  return NextResponse.json(
    { success: true, correlationId, duplicate: result.kind === "duplicate" },
    { status: result.kind === "created" ? 201 : 200, headers: corsHeaders(origin, cred.allowedOrigins) }
  )
}

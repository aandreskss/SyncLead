import { NextRequest, NextResponse } from "next/server"
import { Ratelimit } from "@upstash/ratelimit"
import { getRedis } from "@/lib/redis"
import { ServerPayloadSchema, MAX_BODY_BYTES } from "@/lib/ingest/schema"
import { lookupCredential } from "@/lib/ingest/lookup"
import { normalizeLeadData, extractTrustedIp, extractTrustedUserAgent } from "@/lib/ingest/normalize"
import { persistLead } from "@/lib/ingest/persist"
import { logIngestError } from "@/lib/ingest/errors"

// ─── Rate limiter: 1000 req/min per credential prefix ────────────────────────
let ratelimit: Ratelimit | null = null
const redis = getRedis()
if (redis) {
  ratelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(1000, "1 m"), prefix: "sl:server" })
}

function publicError(correlationId: string, status: number, message = "Request could not be processed") {
  return NextResponse.json({ error: message, correlationId }, { status })
}

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID()

  // ─ 1. Size guard ──────────────────────────────────────────────────────────────
  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10)
  if (contentLength > MAX_BODY_BYTES) return publicError(correlationId, 413)

  // ─ 2. Content-Type guard ──────────────────────────────────────────────────────
  const ct = (req.headers.get("content-type") ?? "").toLowerCase()
  if (!ct.includes("application/json")) return publicError(correlationId, 415)

  // ─ 3. Extract API key from Authorization header ───────────────────────────────
  // Expected format: "Authorization: Bearer slk_xxx"
  const authHeader = req.headers.get("authorization") ?? ""
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) return publicError(correlationId, 401, "Missing or invalid Authorization header")
  const rawKey = match[1].trim()

  // ─ 4. Resolve credential (server_secret type only) ───────────────────────────
  // Hash comparison happens inside lookupCredential — the raw key is never logged
  const cred = await lookupCredential(rawKey)
  if (!cred || cred.credentialType !== "server_secret") return publicError(correlationId, 401)
  if (!cred.campaignId) return publicError(correlationId, 422, "Credential must be campaign-scoped")
  if (!cred.campaignActive) return publicError(correlationId, 403, "Campaign is inactive")

  // ─ 5. Rate limit by credential ───────────────────────────────────────────────
  if (ratelimit) {
    const { success } = await ratelimit.limit(cred.credentialId)
    if (!success) return publicError(correlationId, 429, "Too many requests")
  }

  // ─ 6. Parse body ──────────────────────────────────────────────────────────────
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return publicError(correlationId, 400, "Invalid JSON body")
  }

  if (JSON.stringify(rawBody).length > MAX_BODY_BYTES) return publicError(correlationId, 413)

  // ─ 7. Zod validation ──────────────────────────────────────────────────────────
  const parsed = ServerPayloadSchema.safeParse(rawBody)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    logIngestError({
      orgId: cred.orgId,
      campaignId: cred.campaignId,
      clientId: cred.clientId,
      source: "server",
      errorType: "validation_error",
      zodError: parsed.error,
    })
    return NextResponse.json(
      { error: issue?.message ?? "Invalid payload", correlationId },
      { status: 400 }
    )
  }

  // ─ 8. Normalize — IP and UA always from server headers ───────────────────────
  const normalizedLead = normalizeLeadData(parsed.data)
  const ip = extractTrustedIp(req)
  const userAgent = extractTrustedUserAgent(req)

  // ─ 9. Persist ─────────────────────────────────────────────────────────────────
  const result = await persistLead({
    credential: { credentialId: cred.credentialId, orgId: cred.orgId, campaignId: cred.campaignId! },
    lead: normalizedLead,
    ip,
    userAgent,
    source: "server",
  })

  if (result.kind === "error") {
    console.error("[ingest/server] persist failed:", result.internalCode, correlationId)
    return publicError(correlationId, 500)
  }

  return NextResponse.json(
    { success: true, correlationId, duplicate: result.kind === "duplicate" },
    { status: result.kind === "created" ? 201 : 200 }
  )
}

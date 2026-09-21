import { NextRequest, NextResponse } from "next/server"
import { ServerPayloadSchema, MAX_BODY_BYTES } from "@/lib/ingest/schema"
import { lookupCredential, lookupLegacyApiKey } from "@/lib/ingest/lookup"
import { normalizeLeadData } from "@/lib/ingest/normalize"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Campaign-Key, Authorization",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

/**
 * Validates an ingest payload without persisting it.
 * Accepts the same auth as /api/ingest/server (Authorization: Bearer slk_xxx)
 * or the legacy X-Campaign-Key header.
 * Returns normalized field values so the caller can verify the data looks right.
 */
export async function POST(req: NextRequest) {
  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10)
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ valid: false, errors: [{ field: "_body", message: "Payload too large" }] }, { status: 413, headers: CORS })
  }

  // Accept both auth styles
  const authHeader = req.headers.get("authorization") ?? ""
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i)
  const rawKey = bearerMatch?.[1]?.trim() ?? req.headers.get("x-campaign-key") ?? ""

  if (!rawKey) {
    return NextResponse.json(
      { valid: false, errors: [{ field: "_auth", message: "Missing API key (Authorization: Bearer or X-Campaign-Key)" }] },
      { status: 401, headers: CORS }
    )
  }

  // Try new credential system first, then fall back to legacy api_key
  const cred = await lookupCredential(rawKey)
  const legacyCampaign = !cred ? await lookupLegacyApiKey(rawKey) : null

  if (!cred && !legacyCampaign) {
    return NextResponse.json(
      { valid: false, errors: [{ field: "_auth", message: "Invalid or revoked API key" }] },
      { status: 401, headers: CORS }
    )
  }

  const campaignActive = cred ? cred.campaignActive : (legacyCampaign?.active ?? false)
  const campaignId = cred ? cred.campaignId : legacyCampaign!.id

  if (!campaignActive) {
    return NextResponse.json(
      { valid: false, errors: [{ field: "_auth", message: "Campaign is inactive" }] },
      { status: 403, headers: CORS }
    )
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json(
      { valid: false, errors: [{ field: "_body", message: "Invalid JSON" }] },
      { status: 400, headers: CORS }
    )
  }

  if (JSON.stringify(rawBody).length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { valid: false, errors: [{ field: "_body", message: "Payload too large" }] },
      { status: 413, headers: CORS }
    )
  }

  const parsed = ServerPayloadSchema.safeParse(rawBody)
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      field: issue.path.join(".") || "_root",
      message: issue.message,
    }))
    return NextResponse.json({ valid: false, errors }, { status: 400, headers: CORS })
  }

  const normalized = normalizeLeadData(parsed.data)

  return NextResponse.json(
    {
      valid: true,
      normalized: {
        name: normalized.name,
        phone: normalized.phone,
        email: normalized.email,
        city: normalized.city,
        negocioNormalized: normalized.negocioNormalized,
        cityCanonical: normalized.cityCanonical,
        utmSource: normalized.utmSource,
        utmCampaign: normalized.utmCampaign,
      },
      campaignId,
    },
    { status: 200, headers: CORS }
  )
}

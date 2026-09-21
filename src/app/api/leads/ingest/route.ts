/**
 * @deprecated Use /api/ingest/server (Mode B) for server-to-server ingestion.
 * This endpoint keeps the old campaigns.api_key lookup for backward compatibility.
 * It will be removed when campaigns.api_key is dropped (Prompt 14+).
 *
 * Migration guide:
 *  - Replace X-Campaign-Key header with Authorization: Bearer <server_secret>
 *  - Point your integration to POST /api/ingest/server
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { campaigns, leads, webhookEvents } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { normalizePhone, normalizeCity } from "@/domains/leads/normalize"
import { autoQualifyLeadInternal } from "@/domains/qualification/actions"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Campaign-Key",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

let ratelimit: Ratelimit | null = null
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
  ratelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, "1 m"), prefix: "synclead:ingest" })
}

const IngestPayloadSchema = z.object({
  name: z.string().min(1, "name is required").max(255).trim(),
  phone: z.string().max(30).optional().nullable(),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().email().max(255).optional().nullable()
  ),
  city: z.string().max(100).optional().default(""),
  negocio: z.union([z.boolean(), z.string(), z.number()]).optional(),
  event_id: z.string().max(255).optional(),
  utm_source: z.string().max(255).optional().nullable(),
  utm_medium: z.string().max(255).optional().nullable(),
  utm_campaign: z.string().max(255).optional().nullable(),
  utm_content: z.string().max(255).optional().nullable(),
  fbclid: z.string().max(500).optional().nullable(),
  fbc: z.string().max(500).optional().nullable(),
  fbp: z.string().max(500).optional().nullable(),
  landing_url: z.string().url().max(2048).optional().nullable(),
  referrer_url: z.string().url().max(2048).optional().nullable(),
  platform: z.string().max(50).optional().nullable(),
  device: z.string().max(50).optional().nullable(),
  ip: z.string().max(45).optional().nullable(),
  user_agent: z.string().max(512).optional().nullable(),
  meta_campaign_name: z.string().max(255).optional().nullable(),
  meta_adset_name: z.string().max(255).optional().nullable(),
  meta_ad_name: z.string().max(255).optional().nullable(),
})

type IngestPayload = z.infer<typeof IngestPayloadSchema>

export async function POST(req: NextRequest) {
  // Leer el body primero — sendBeacon no puede enviar headers custom,
  // por lo que el SDK nuevo incluye el key en el body como _key.
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS })
  }

  // Key desde header (fetch legacy) o desde body (sendBeacon)
  let apiKey = req.headers.get("x-campaign-key")
  if (!apiKey && rawBody && typeof rawBody === "object" && "_key" in rawBody) {
    apiKey = (rawBody as Record<string, unknown>)._key as string
    const { _key: _, ...rest } = rawBody as Record<string, unknown>
    rawBody = rest
  }

  if (!apiKey) {
    return NextResponse.json({ error: "Missing X-Campaign-Key header" }, { status: 401, headers: CORS })
  }

  if (ratelimit) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1"
    const { success } = await ratelimit.limit(ip)
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: CORS })
    }
  }

  // Legacy: look up by plain-text api_key (deprecated column)
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.apiKey, apiKey),
  })
  if (!campaign) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401, headers: CORS })
  }
  if (!campaign.active) {
    return NextResponse.json({ error: "Campaign is inactive" }, { status: 403, headers: CORS })
  }

  const parsed = IngestPayloadSchema.safeParse(rawBody)
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]
    return NextResponse.json(
      { error: firstError?.message ?? "Invalid payload" },
      { status: 400, headers: CORS }
    )
  }

  const body: IngestPayload = parsed.data
  const eventId = body.event_id ?? null

  if (eventId) {
    const existing = await db.query.webhookEvents.findFirst({
      where: and(eq(webhookEvents.campaignId, campaign.id), eq(webhookEvents.eventId, eventId)),
    })
    if (existing) {
      return NextResponse.json({ success: true, duplicate: true }, { status: 200, headers: CORS })
    }
  }

  const isNegocio =
    body.negocio === true || body.negocio === "true" || body.negocio === 1 || body.negocio === "1"
  const phone = body.phone ? normalizePhone(body.phone) : null
  const city = normalizeCity(body.city ?? "")
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null

  const [event] = await db
    .insert(webhookEvents)
    .values({
      campaignId: campaign.id,
      eventId: eventId ?? crypto.randomUUID(),
      rawPayload: rawBody as Record<string, unknown>,
      processed: false,
    })
    .returning()

  try {
    const [lead] = await db
      .insert(leads)
      .values({
        orgId: campaign.orgId,
        campaignId: campaign.id,
        name: body.name,
        email: body.email ? body.email.toLowerCase().trim() : null,
        phone,
        city: city || null,
        negocio: isNegocio,
        utmSource: body.utm_source ?? null,
        utmMedium: body.utm_medium ?? null,
        utmCampaign: body.utm_campaign ?? null,
        utmContent: body.utm_content ?? null,
        fbclid: body.fbclid ?? null,
        fbc: body.fbc ?? null,
        fbp: body.fbp ?? null,
        landingUrl: body.landing_url ?? null,
        referrerUrl: body.referrer_url ?? null,
        metaCampaignName: body.meta_campaign_name ?? null,
        metaAdsetName: body.meta_adset_name ?? null,
        metaAdName: body.meta_ad_name ?? null,
        platform: body.platform ?? null,
        device: body.device ?? null,
        ip: body.ip ?? clientIp,
        userAgent: body.user_agent ?? req.headers.get("user-agent") ?? null,
        externalEventId: eventId,
        eventId,
        temperature: "cold",
      })
      .returning()

    await db.update(webhookEvents).set({ processed: true }).where(eq(webhookEvents.id, event.id))

    autoQualifyLeadInternal(lead.id, campaign.orgId, campaign.id).catch(() => undefined)

    return NextResponse.json({ success: true, leadId: lead.id }, { status: 201, headers: CORS })
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({ error: err instanceof Error ? err.message : "unknown error" })
      .where(eq(webhookEvents.id, event.id))

    console.error("[ingest/legacy] lead insert failed:", err instanceof Error ? err.name : "Error")
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS })
  }
}

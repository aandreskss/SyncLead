import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createHash } from "crypto"
import { db } from "@/lib/db"
import { conversionTestSessions, conversionObservations } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import {
  getTrackingSiteByCollectToken,
  getDefinitionByEventNameForSite,
} from "@/domains/tracking/repository"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

const MAX_BODY_BYTES = 10 * 1024

const CollectEventSchema = z.object({
  eventName: z.string().min(1).max(100),
  eventId: z.string().max(255).optional(),
  pageUrl: z.string().url().refine(
    (u) => u.startsWith("http://") || u.startsWith("https://"),
    "Solo http/https"
  ),
  environment: z.enum(["production", "staging", "development"]).default("production"),
  parameters: z.record(z.string(), z.boolean()).optional().default({}),
  visitorId: z.string().max(128).optional(),
  utmSource: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
  referrer: z.string().max(500).optional(),
})

function extractVisitorGeo(req: NextRequest): { city: string | null; country: string | null } {
  // Vercel expone geo como x-vercel-ip-* ; fallback a cf-ip* para otros proxies
  const country = req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry")
  const city = req.headers.get("x-vercel-ip-city") ?? req.headers.get("cf-ipcity")
  return {
    country: country && country !== "XX" && country !== "T1" ? country : null,
    city: city || null,
  }
}

function sanitizePageUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    return `${u.protocol}//${u.host}${u.pathname}`
  } catch {
    return null
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function hashEventId(eventId: string): string {
  return createHash("sha256").update(eventId).digest("hex")
}

function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (allowedOrigins.length === 0) return true
  if (!origin) return false
  return allowedOrigins.some((allowed) => {
    try {
      return new URL(allowed).origin === new URL(origin).origin
    } catch {
      return false
    }
  })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const rawText = await request.text()
  if (rawText.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Payload too large" },
      { status: 413, headers: CORS_HEADERS }
    )
  }

  let body: unknown
  try {
    body = JSON.parse(rawText)
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const parsed = CollectEventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const { eventName, eventId, pageUrl, environment, parameters, visitorId, utmSource, utmMedium, utmCampaign, referrer } = parsed.data

  const tokenHash = hashToken(token)

  const session = await db.query.conversionTestSessions.findFirst({
    where: eq(conversionTestSessions.publicTokenHash, tokenHash),
    with: {
      trackingSite: true,
      conversionDefinition: true,
    },
  })

  if (!session) {
    // ── Fallback: permanent site-level collect token ──────────────────────────
    // The token is stored as plain text on tracking_sites.collect_token.
    // Events sent here are real browser pixel events, not test sessions.
    const site = await getTrackingSiteByCollectToken(token)

    if (!site || !site.diagnosticsEnabled) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: CORS_HEADERS }
      )
    }

    const origin = request.headers.get("origin")
    const allowedOrigins = site.allowedOrigins ?? []
    if (!isOriginAllowed(origin, allowedOrigins)) {
      return NextResponse.json(
        { error: "Origin not allowed" },
        { status: 403, headers: CORS_HEADERS }
      )
    }

    const sanitizedUrl = sanitizePageUrl(pageUrl)
    const eventIdHash = eventId ? hashEventId(eventId) : null
    const geo = extractVisitorGeo(request)

    // Try to match the event name against a conversion definition for this site
    const definition = await getDefinitionByEventNameForSite(site.id, site.orgId, eventName)
    const requiredParams: string[] = definition?.requiredParameters ?? []
    const validationResult: Record<string, unknown> = {}
    for (const param of requiredParams) {
      validationResult[param] = parameters[param] === true ? "present" : "missing"
    }

    await db.insert(conversionObservations).values({
      orgId: site.orgId,
      clientId: site.clientId,
      trackingSiteId: site.id,
      conversionDefinitionId: definition?.id ?? null,
      testSessionId: null,
      source: "browser_pixel",
      eventName,
      eventIdHash,
      pageUrl: sanitizedUrl,
      visitorId: visitorId ?? null,
      visitorCity: geo.city,
      visitorCountry: geo.country,
      utmSource: utmSource ?? null,
      utmMedium: utmMedium ?? null,
      utmCampaign: utmCampaign ?? null,
      referrer: referrer ?? null,
      environment: environment as "production" | "staging" | "development",
      parametersPresent: parameters,
      validationResult,
    })

    return NextResponse.json(
      { received: true },
      { status: 200, headers: CORS_HEADERS }
    )
  }

  if (session.status !== "pending" && session.status !== "active") {
    return NextResponse.json(
      { error: "Session no longer active" },
      { status: 410, headers: CORS_HEADERS }
    )
  }

  if (session.expiresAt < new Date()) {
    await db
      .update(conversionTestSessions)
      .set({ status: "expired" })
      .where(eq(conversionTestSessions.id, session.id))
      .catch(() => undefined)

    return NextResponse.json(
      { error: "Session expired" },
      { status: 410, headers: CORS_HEADERS }
    )
  }

  const origin = request.headers.get("origin")
  const allowedOrigins = session.trackingSite?.allowedOrigins ?? []
  if (!isOriginAllowed(origin, allowedOrigins)) {
    return NextResponse.json(
      { error: "Origin not allowed" },
      { status: 403, headers: CORS_HEADERS }
    )
  }

  const sanitizedUrl = sanitizePageUrl(pageUrl)
  const geo = extractVisitorGeo(request)

  const definition = session.conversionDefinition
  const requiredParams: string[] = definition?.requiredParameters ?? []
  const validationResult: Record<string, unknown> = {}
  for (const param of requiredParams) {
    validationResult[param] = parameters[param] === true ? "present" : "missing"
  }

  const eventIdHash = eventId ? hashEventId(eventId) : null

  await db.insert(conversionObservations).values({
    orgId: session.orgId,
    clientId: session.clientId,
    trackingSiteId: session.trackingSiteId ?? undefined,
    conversionDefinitionId: session.conversionDefinitionId,
    testSessionId: session.id,
    source: "diagnostic_collector",
    eventName,
    eventIdHash,
    pageUrl: sanitizedUrl,
    visitorId: visitorId ?? null,
    visitorCity: geo.city,
    visitorCountry: geo.country,
    utmSource: utmSource ?? null,
    utmMedium: utmMedium ?? null,
    utmCampaign: utmCampaign ?? null,
    referrer: referrer ?? null,
    environment: environment as "production" | "staging" | "development",
    parametersPresent: parameters,
    validationResult,
  })

  if (session.status === "pending") {
    await db
      .update(conversionTestSessions)
      .set({ status: "active" })
      .where(
        and(
          eq(conversionTestSessions.id, session.id),
          eq(conversionTestSessions.status, "pending")
        )
      )
      .catch(() => undefined)
  }

  return NextResponse.json(
    { received: true, sessionId: session.id },
    { status: 200, headers: CORS_HEADERS }
  )
}

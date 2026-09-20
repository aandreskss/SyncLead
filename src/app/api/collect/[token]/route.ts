import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createHash } from "crypto"
import { db } from "@/lib/db"
import { conversionTestSessions, conversionObservations } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

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
})

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

  const { eventName, eventId, pageUrl, environment, parameters } = parsed.data

  const tokenHash = hashToken(token)

  const session = await db.query.conversionTestSessions.findFirst({
    where: eq(conversionTestSessions.publicTokenHash, tokenHash),
    with: {
      trackingSite: true,
      conversionDefinition: true,
    },
  })

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS_HEADERS }
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

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { leads, leadBehaviorEvents, campaigns } from "@/lib/db/schema"
import { and, eq, inArray, or } from "drizzle-orm"
import { lookupCredential } from "@/lib/ingest/lookup"
import { autoQualifyLeadInternal } from "@/domains/qualification/actions"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

const BEHAVIOR_EVENT_TYPES = [
  "begin_checkout",
  "checkout_abandoned",
  "add_to_cart",
  "remove_from_cart",
  "form_submitted",
  "info_requested",
  "view_product",
  "payment_failed",
  "purchase",
] as const

const BehaviorEventSchema = z
  .object({
    eventType: z.enum(BEHAVIOR_EVENT_TYPES),
    email: z.string().email().optional(),
    phone: z.string().min(5).max(30).optional(),
    value: z.number().positive().optional(),
    currency: z.string().length(3).optional(),
    productId: z.string().max(255).optional(),
    variantId: z.string().max(255).optional(),
    category: z.string().max(255).optional(),
    quantity: z.number().int().positive().optional(),
    externalId: z.string().max(255).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    occurredAt: z.string().datetime().optional(),
  })
  .refine((d) => d.email || d.phone, { message: "email or phone required to identify the lead" })

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS_HEADERS })
  }

  const ctx = await lookupCredential(token)
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS_HEADERS })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: CORS_HEADERS })
  }

  // Enforce body size (extra guard — Next.js config handles it at the server level)
  if (JSON.stringify(body).length > 10_240) {
    return NextResponse.json({ error: "payload too large" }, { status: 413, headers: CORS_HEADERS })
  }

  const parsed = BehaviorEventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400, headers: CORS_HEADERS })
  }

  const data = parsed.data
  const { orgId, clientId } = ctx

  // Collect all campaigns belonging to this client (scoped to org)
  const clientCampaigns = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.clientId, clientId), eq(campaigns.orgId, orgId), eq(campaigns.active, true)))

  const campaignIds = clientCampaigns.map((c) => c.id)
  if (campaignIds.length === 0) {
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  }

  // Find the lead by email or phone within this client's campaigns
  const matchConditions: ReturnType<typeof eq>[] = []
  if (data.email) matchConditions.push(eq(leads.email, data.email.toLowerCase().trim()))
  if (data.phone) {
    const normalizedPhone = data.phone.replace(/\D/g, "")
    if (normalizedPhone) matchConditions.push(eq(leads.phone, normalizedPhone))
  }

  const lead = matchConditions.length > 0
    ? await db.query.leads.findFirst({
        where: and(
          eq(leads.orgId, orgId),
          inArray(leads.campaignId, campaignIds),
          or(...matchConditions)
        ),
        columns: { id: true, campaignId: true },
      })
    : undefined

  // Insert behavior event — idempotent when externalId is provided
  await db
    .insert(leadBehaviorEvents)
    .values({
      orgId,
      leadId: lead?.id ?? null,
      eventType: data.eventType,
      externalId: data.externalId ?? null,
      productId: data.productId ?? null,
      variantId: data.variantId ?? null,
      category: data.category ?? null,
      quantity: data.quantity ?? null,
      value: data.value != null ? String(data.value) : null,
      currency: data.currency?.toUpperCase() ?? null,
      metadata: data.metadata ?? {},
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
    })
    .onConflictDoNothing()

  // A completed purchase always promotes to hot — skip the qualification engine
  if (data.eventType === "purchase" && lead?.id) {
    await db.update(leads)
      .set({ temperature: "hot", updatedAt: new Date() })
      .where(and(eq(leads.id, lead.id), eq(leads.orgId, orgId)))
      .catch(() => undefined)
  }

  // Re-qualify for all other events so behavior (checkout, form, etc.) updates temperature
  if (lead?.id && lead.campaignId && data.eventType !== "purchase") {
    autoQualifyLeadInternal(lead.id, orgId, lead.campaignId).catch(() => undefined)
  }

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
}

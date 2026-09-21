import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { campaigns, leads, metaConnections } from "@/lib/db/schema"
import { eq, and, or, ilike } from "drizzle-orm"
import { normalizePhone } from "@/domains/leads/normalize"
import {
  createConversionIdempotent,
  createMetaEventIdempotent,
  syncLeadConvertedFields,
} from "@/domains/conversions/repository"
import { buildPurchasePayload } from "@/domains/conversions/payload"
import { autoQualifyLeadInternal } from "@/domains/qualification/actions"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Campaign-Key",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

const PurchaseSchema = z.object({
  amount: z.number().positive().finite(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Moneda debe ser código ISO 4217 (ej. USD, EUR, VES)"),
  order_id: z.string().min(1).max(255).optional(),
  lead_id: z.string().uuid().optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  name: z.string().max(255).optional().nullable(),
  event_id: z.string().max(255).optional(),
})

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-campaign-key")
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing X-Campaign-Key header" },
      { status: 401, headers: CORS }
    )
  }

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.apiKey, apiKey),
    columns: { id: true, orgId: true, clientId: true, active: true },
  })
  if (!campaign) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401, headers: CORS })
  }
  if (!campaign.active) {
    return NextResponse.json({ error: "Campaign is inactive" }, { status: 403, headers: CORS })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS })
  }

  const parsed = PurchaseSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400, headers: CORS }
    )
  }

  const body = parsed.data
  const phone = body.phone ? normalizePhone(body.phone) : null
  const orderId = body.order_id ?? body.event_id ?? crypto.randomUUID()

  type LeadCols = {
    id: string
    email: string | null
    phone: string | null
    name: string
    city: string | null
    fbc: string | null
    fbp: string | null
    ip: string | null
    userAgent: string | null
    landingUrl: string | null
  }

  const QUERY_COLS = {
    id: true,
    email: true,
    phone: true,
    name: true,
    city: true,
    fbc: true,
    fbp: true,
    ip: true,
    userAgent: true,
    landingUrl: true,
  } as const

  // ── Buscar lead existente: lead_id directo → email → phone ──────────────
  let lead: LeadCols | null = null

  // 1. Lookup directo por leadId (enviado por sl.js desde localStorage)
  if (body.lead_id) {
    lead = (await db.query.leads.findFirst({
      where: and(eq(leads.id, body.lead_id), eq(leads.orgId, campaign.orgId)),
      columns: QUERY_COLS,
    })) ?? null
  }

  // 2. Fallback por email (case-insensitive) o phone normalizados
  if (!lead && (body.email || phone)) {
    const conditions = []
    if (body.email) conditions.push(ilike(leads.email, body.email.trim()))
    if (phone) conditions.push(eq(leads.phone, phone))

    lead = (await db.query.leads.findFirst({
      where: and(eq(leads.orgId, campaign.orgId), or(...conditions)),
      columns: QUERY_COLS,
      orderBy: (l, { desc }) => [desc(l.createdAt)],
    })) ?? null
  }

  // ── Si no hay lead, crear uno con los datos disponibles ───────────────────
  if (!lead) {
    if (!body.name && !body.email && !phone) {
      return NextResponse.json(
        { error: "No lead found. Provide email or phone to identify the buyer." },
        { status: 400, headers: CORS }
      )
    }

    const [newLead] = await db
      .insert(leads)
      .values({
        orgId: campaign.orgId,
        campaignId: campaign.id,
        name: body.name ?? body.email ?? phone ?? "Unknown",
        email: body.email ?? null,
        phone,
        temperature: "cold",
        eventId: body.event_id ?? null,
        externalEventId: body.event_id ?? null,
      })
      .returning({
        id: leads.id,
        email: leads.email,
        phone: leads.phone,
        name: leads.name,
        city: leads.city,
        fbc: leads.fbc,
        fbp: leads.fbp,
        ip: leads.ip,
        userAgent: leads.userAgent,
        landingUrl: leads.landingUrl,
      })

    lead = newLead as LeadCols
  }

  // ── Registra la conversión (idempotente por org+orderId) ──────────────────
  const { conversion, created } = await createConversionIdempotent({
    orgId: campaign.orgId,
    leadId: lead.id,
    campaignId: campaign.id,
    orderId,
    amount: String(body.amount),
    currency: body.currency,
    convertedAt: new Date(),
    actorId: "api_purchase",
  })

  if (created) {
    // Sync campos legacy del lead (non-blocking)
    syncLeadConvertedFields(
      lead.id,
      campaign.orgId,
      String(body.amount),
      body.currency,
      conversion.convertedAt,
      "api_purchase"
    ).catch(() => undefined)

    // Temperature is determined by the qualification engine (autoQualifyLeadInternal).
    // Do NOT set it here — the qualification profile for this campaign may intentionally
    // result in "warm" (e.g. a catalog purchase that needs follow-up) rather than "hot".
    autoQualifyLeadInternal(lead.id, campaign.orgId, campaign.id).catch(() => undefined)

    // Crea meta_event para el outbox CAPI si hay conexión activa (non-blocking)
    const capturedLead = lead
    ;(async () => {
      try {
        const conn = await db.query.metaConnections.findFirst({
          where: and(
            eq(metaConnections.clientId, campaign.clientId),
            eq(metaConnections.status, "active")
          ),
          columns: { pixelId: true },
        })
        if (conn?.pixelId) {
          const event = buildPurchasePayload({
            conversionId: conversion.id,
            lead: capturedLead,
            amount: String(body.amount),
            currency: body.currency,
            orderId,
            convertedAt: conversion.convertedAt,
          })
          await createMetaEventIdempotent({
            orgId: campaign.orgId,
            leadId: capturedLead.id,
            conversionId: conversion.id,
            pixelId: conn.pixelId,
            event,
          })
        }
      } catch { /* non-blocking — worker retries via outbox cron */ }
    })()
  }

  return NextResponse.json(
    { success: true, conversionId: conversion.id, created },
    { status: created ? 201 : 200, headers: CORS }
  )
}

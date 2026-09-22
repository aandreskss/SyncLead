import "server-only"
import { createHmac } from "crypto"
import { db } from "@/lib/db"
import { leads, webhookEvents, leadActivities, leadAttributionTouchpoints } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { getLeadAdSourceByPage } from "@/domains/lead-ads/repository"
import { decryptTokenVersioned } from "@/lib/crypto"
import { autoQualifyLeadInternal } from "@/domains/qualification/actions"

const META_GRAPH_BASE = "https://graph.facebook.com"

// ─── Webhook verification (GET) ───────────────────────────────────────────────

export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")

  const verifyToken = process.env.META_LEAD_ADS_VERIFY_TOKEN
  if (!verifyToken) return new Response("Webhook not configured", { status: 503 })

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 })
  }

  return new Response("Forbidden", { status: 403 })
}

// ─── Webhook receiver (POST) ──────────────────────────────────────────────────

export async function POST(req: Request) {
  const appSecret = process.env.META_APP_SECRET
  const rawBody = await req.text()

  // Verify signature when META_APP_SECRET is configured
  if (appSecret) {
    const sig = req.headers.get("x-hub-signature-256") ?? ""
    const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex")
    if (sig !== expected) return new Response("Signature mismatch", { status: 403 })
  }

  let body: MetaLeadsWebhookPayload
  try {
    body = JSON.parse(rawBody) as MetaLeadsWebhookPayload
  } catch {
    return new Response("Bad JSON", { status: 400 })
  }

  if (body.object !== "page") return new Response("OK", { status: 200 })

  // Process entries fire-and-forget so Meta doesn't timeout
  processEntries(body.entry).catch(() => undefined)

  return new Response("OK", { status: 200 })
}

// ─── Processing ───────────────────────────────────────────────────────────────

async function processEntries(entries: MetaLeadsWebhookPayload["entry"]) {
  for (const entry of entries) {
    for (const change of entry.changes) {
      if (change.field !== "leadgen") continue
      await processLeadgen(change.value).catch(() => undefined)
    }
  }
}

async function processLeadgen(value: LeadgenValue) {
  const { leadgen_id, page_id, form_id, campaign_id, campaign_name, adgroup_id, adgroup_name, ad_id, ad_name } = value

  // Find which SyncLead campaign this page+form maps to
  const source = await getLeadAdSourceByPage(page_id, form_id)
  if (!source) return // Not configured — ignore

  // Idempotency: if this leadgen_id was already processed for this campaign, skip
  const existing = await db.query.webhookEvents.findFirst({
    where: and(
      eq(webhookEvents.campaignId, source.campaignId),
      eq(webhookEvents.eventId, leadgen_id),
    ),
    columns: { id: true },
  })
  if (existing) return

  // Fetch lead data from Meta Graph API
  if (!source.pageAccessTokenEnc) return
  let token: string
  try { token = decryptTokenVersioned(source.pageAccessTokenEnc) } catch { return }

  const apiVersion = process.env.META_GRAPH_API_VERSION ?? "v19.0"
  const res = await fetch(
    `${META_GRAPH_BASE}/${apiVersion}/${leadgen_id}?fields=field_data,created_time&access_token=${token}`,
    { signal: AbortSignal.timeout(10_000) }
  )
  if (!res.ok) return

  const data = await res.json() as MetaLeadData
  if (!data.field_data?.length) return

  // Map Meta fields → SyncLead lead fields
  const fields = mapMetaFields(data.field_data)
  if (!fields.name) return // Name is required

  // Insert idempotency anchor
  await db
    .insert(webhookEvents)
    .values({
      campaignId: source.campaignId,
      eventId: leadgen_id,
      rawPayload: { leadgen_id, page_id, form_id },
      processed: false,
    })
    .onConflictDoNothing()

  // Insert lead
  const [lead] = await db
    .insert(leads)
    .values({
      orgId: source.orgId,
      campaignId: source.campaignId,
      name: fields.name,
      email: fields.email ?? null,
      phone: fields.phone ?? null,
      city: fields.city ?? null,
      negocioRaw: fields.negocio ?? null,
      temperature: "cold",
      leadSource: "meta_ads",
      stage: "new",
      externalEventId: leadgen_id,
      metaCampaignName: campaign_name ?? null,
      metaAdsetName: adgroup_name ?? null,
      metaAdName: ad_name ?? null,
    })
    .returning({ id: leads.id })
    .catch(() => [])

  if (!lead) return

  // Attribution touchpoint
  await db
    .insert(leadAttributionTouchpoints)
    .values({
      leadId: lead.id,
      orgId: source.orgId,
      campaignId: source.campaignId,
      touchType: "first_touch",
      channel: "paid_social",
      metaCampaignId: campaign_id ?? null,
      metaAdsetId: adgroup_id ?? null,
      metaAdId: ad_id ?? null,
    })
    .catch(() => undefined)

  // Activity
  await db
    .insert(leadActivities)
    .values({
      leadId: lead.id,
      orgId: source.orgId,
      actorType: "api",
      activityType: "created",
      metadata: { source: "meta_lead_ads", channel: "paid_social", hasEmail: !!fields.email, hasPhone: !!fields.phone },
    })
    .catch(() => undefined)

  // Mark webhook processed
  await db
    .update(webhookEvents)
    .set({ processed: true })
    .where(and(eq(webhookEvents.campaignId, source.campaignId), eq(webhookEvents.eventId, leadgen_id)))
    .catch(() => undefined)

  // Auto-qualify fire-and-forget
  autoQualifyLeadInternal(lead.id, source.orgId, source.campaignId).catch(() => undefined)
}

// ─── Field mapping ────────────────────────────────────────────────────────────

function mapMetaFields(fieldData: MetaFieldData[]): {
  name?: string
  email?: string
  phone?: string
  city?: string
  negocio?: string
} {
  const map: Record<string, string> = {}
  for (const f of fieldData) {
    map[f.name] = f.values[0] ?? ""
  }

  const firstName = map["first_name"] ?? ""
  const lastName = map["last_name"] ?? ""
  const combined = firstName && lastName ? `${firstName} ${lastName}` : (firstName || lastName)
  const fullName = map["full_name"] || combined || undefined

  const negocioCandidate = map["negocio"] ?? map["tiene_negocio"] ?? map["business"] ?? map["servicio"] ?? undefined

  return {
    name: fullName,
    email: map["email"] || undefined,
    phone: map["phone_number"] || map["phone"] || undefined,
    city: map["city"] || map["ciudad"] || undefined,
    negocio: negocioCandidate,
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetaFieldData {
  name: string
  values: string[]
}

interface MetaLeadData {
  id: string
  created_time?: number
  field_data?: MetaFieldData[]
}

interface LeadgenValue {
  leadgen_id: string
  page_id: string
  form_id?: string
  adgroup_id?: string
  ad_id?: string
  campaign_id?: string
  adgroup_name?: string
  ad_name?: string
  campaign_name?: string
  created_time?: number
}

interface MetaLeadsWebhookPayload {
  object: string
  entry: Array<{
    id: string
    time: number
    changes: Array<{
      field: string
      value: LeadgenValue
    }>
  }>
}

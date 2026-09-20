import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  metaConnections,
  campaigns,
  ingestionCredentials,
  leads,
  webhookEvents,
  leadAttributionTouchpoints,
  leadActivities,
} from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { decryptTokenVersioned } from "@/lib/crypto"
import { fetchMetaLead, parseLeadFields } from "@/domains/meta/lead-ads"
import { createHash, randomBytes } from "crypto"
import { autoQualifyLeadInternal } from "@/domains/qualification/actions"

// ─── Webhook verification (GET) ───────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params

  if (!/^[0-9a-f-]{36}$/.test(clientId)) {
    return new NextResponse("Invalid client", { status: 400 })
  }

  const sp = request.nextUrl.searchParams
  const mode = sp.get("hub.mode")
  const challenge = sp.get("hub.challenge")
  const verifyToken = sp.get("hub.verify_token")

  if (mode !== "subscribe" || !challenge || !verifyToken) {
    return new NextResponse("Bad request", { status: 400 })
  }

  // Find meta_connection that matches clientId AND webhookVerifyToken
  const conn = await db.query.metaConnections.findFirst({
    where: and(
      eq(metaConnections.clientId, clientId),
      eq(metaConnections.webhookVerifyToken, verifyToken),
      eq(metaConnections.leadAdsEnabled, true)
    ),
  })

  if (!conn) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  // Respond with the challenge as plain text — required by Meta
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  })
}

// ─── Webhook event (POST) ─────────────────────────────────────────────────────

type MetaWebhookChange = {
  field: string
  value: {
    leadgen_id?: string
    page_id?: string
    form_id?: string
    adgroup_id?: string
    ad_id?: string
    created_time?: number
  }
}

type MetaWebhookBody = {
  object?: string
  entry?: Array<{
    id?: string
    time?: number
    changes?: MetaWebhookChange[]
  }>
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params

  // Return 200 immediately so Meta doesn't retry while we process
  const responsePromise = NextResponse.json({ ok: true }, { status: 200 })

  if (!/^[0-9a-f-]{36}$/.test(clientId)) {
    return responsePromise
  }

  let body: MetaWebhookBody
  try {
    body = await request.json() as MetaWebhookBody
  } catch {
    return responsePromise
  }

  if (body.object !== "page" || !Array.isArray(body.entry)) {
    return responsePromise
  }

  // Process asynchronously — don't await (we already responded 200)
  processMetaWebhook(clientId, body).catch(() => undefined)

  return responsePromise
}

async function processMetaWebhook(clientId: string, body: MetaWebhookBody) {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue

      const leadgenId = change.value?.leadgen_id
      const pageId = change.value?.page_id
      if (!leadgenId) continue

      await processLeadgenChange(clientId, leadgenId, pageId ?? null)
    }
  }
}

async function processLeadgenChange(
  clientId: string,
  leadgenId: string,
  pageId: string | null
) {
  // Find meta_connection for this client (optionally matching pageId)
  const conn = await db.query.metaConnections.findFirst({
    where: and(
      eq(metaConnections.clientId, clientId),
      eq(metaConnections.leadAdsEnabled, true)
    ),
  })

  if (!conn) return
  if (!conn.accessTokenEnc) return

  // Decrypt access token
  let accessToken: string
  try {
    accessToken = decryptTokenVersioned(conn.accessTokenEnc)
  } catch {
    return
  }

  // Fetch lead data from Meta Lead Gen API
  const metaLead = await fetchMetaLead(leadgenId, accessToken, conn.graphApiVersion)
  if (!metaLead) return

  const parsed = parseLeadFields(metaLead.fieldData)

  // We need a name at minimum (default to "Lead" if unavailable)
  const name = parsed.name ?? "Lead"

  // Find or create the "Meta Lead Ads" campaign for this client
  const campaign = await findOrCreateMetaLeadAdsCampaign(clientId, conn.orgId)
  if (!campaign) return

  // Idempotency: use leadgen_id as the event ID
  const eventId = `meta_leadgen_${leadgenId}`

  const [event] = await db
    .insert(webhookEvents)
    .values({
      campaignId: campaign.id,
      eventId,
      rawPayload: {
        source: "meta_lead_ads",
        leadgenId,
        pageId,
        hasEmail: !!parsed.email,
        hasPhone: !!parsed.phone,
      },
      processed: false,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id })

  if (!event) return // Duplicate

  // Insert lead
  let leadId: string
  try {
    const [newLead] = await db
      .insert(leads)
      .values({
        orgId: conn.orgId,
        campaignId: campaign.id,
        name,
        email: parsed.email,
        phone: parsed.phone,
        city: parsed.city,
        negocio: false,
        temperature: "cold",
        utmSource: "facebook",
        utmMedium: "lead_ads",
        metaCampaignName: metaLead.campaignName,
        metaAdsetName: metaLead.adsetName,
        metaAdName: metaLead.adName,
        platform: "meta_lead_ads",
        externalEventId: eventId,
        eventId,
        customData: Object.keys(parsed.customFields).length > 0 ? parsed.customFields : {},
      })
      .returning({ id: leads.id })

    leadId = newLead.id
  } catch {
    await db
      .update(webhookEvents)
      .set({ error: "lead_insert_error" })
      .where(eq(webhookEvents.id, event.id))
      .catch(() => undefined)
    return
  }

  // First-touch attribution
  await db
    .insert(leadAttributionTouchpoints)
    .values({
      leadId,
      orgId: conn.orgId,
      campaignId: campaign.id,
      touchType: "first_touch",
      channel: "lead_ads",
      metaCampaignId: metaLead.campaignId,
      metaAdsetId: metaLead.adsetId,
      metaAdId: metaLead.adId,
      utmSource: "facebook",
      utmMedium: "lead_ads",
    })
    .catch(() => undefined)

  // Activity
  await db
    .insert(leadActivities)
    .values({
      leadId,
      orgId: conn.orgId,
      actorType: "api",
      activityType: "created",
      metadata: {
        source: "meta_lead_ads",
        channel: "lead_ads",
        temperature: "cold",
        hasEmail: !!parsed.email,
        hasPhone: !!parsed.phone,
      },
    })
    .catch(() => undefined)

  // Mark processed
  await db
    .update(webhookEvents)
    .set({ processed: true })
    .where(eq(webhookEvents.id, event.id))
    .catch(() => undefined)

  // Auto-qualify (fire-and-forget)
  autoQualifyLeadInternal(leadId, conn.orgId, campaign.id).catch(() => undefined)
}

async function findOrCreateMetaLeadAdsCampaign(
  clientId: string,
  orgId: string
): Promise<{ id: string } | null> {
  // Look for existing "meta-lead-ads" campaign
  const existing = await db.query.campaigns.findFirst({
    where: and(
      eq(campaigns.clientId, clientId),
      eq(campaigns.orgId, orgId),
      eq(campaigns.slug, "meta-lead-ads")
    ),
    columns: { id: true },
  })

  if (existing) return existing

  // Create a new campaign; campaigns.apiKey must be unique — generate a random one
  const randomApiKey = `mlads_${randomBytes(16).toString("hex")}`

  try {
    const [newCampaign] = await db
      .insert(campaigns)
      .values({
        orgId,
        clientId,
        name: "Meta Lead Ads",
        slug: "meta-lead-ads",
        apiKey: randomApiKey,
        active: true,
      })
      .returning({ id: campaigns.id })

    // Also create a public_form ingestion credential for the capture script.
    // pub_ keys are safe to embed in client-side JS — they're rate-limited and public.
    // We store the raw key in meta_connections.capture_script_key for the capture endpoint.
    const rawKey = `pub_mlads_${randomBytes(24).toString("hex")}`
    const keyHash = createHash("sha256").update(rawKey).digest("hex")
    const keyPrefix = rawKey.slice(0, 10)

    await db
      .insert(ingestionCredentials)
      .values({
        orgId,
        campaignId: newCampaign.id,
        type: "public_form",
        keyHash,
        keyPrefix,
        status: "active",
        allowedOrigins: [],
      })
      .catch(() => undefined)

    // Store the raw public key in meta_connections for the capture script endpoint
    await db
      .update(metaConnections)
      .set({ captureScriptKey: rawKey, updatedAt: new Date() })
      .where(and(eq(metaConnections.clientId, clientId), eq(metaConnections.orgId, orgId)))
      .catch(() => undefined)

    return { id: newCampaign.id }
  } catch {
    // Race condition: another request may have created it
    const retry = await db.query.campaigns.findFirst({
      where: and(
        eq(campaigns.clientId, clientId),
        eq(campaigns.orgId, orgId),
        eq(campaigns.slug, "meta-lead-ads")
      ),
      columns: { id: true },
    })
    return retry ?? null
  }
}

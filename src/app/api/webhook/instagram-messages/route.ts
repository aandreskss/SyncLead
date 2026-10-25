import "server-only"
import { createHmac } from "crypto"
import { db } from "@/lib/db"
import { leads, webhookEvents, leadActivities, leadAttributionTouchpoints, instagramMessageSources } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { decryptTokenVersioned } from "@/lib/crypto"
import { autoQualifyLeadInternal } from "@/domains/qualification/actions"
import {
  getIgMessageSourceByPageId,
  resolveIgCampaignFromAdId,
} from "@/domains/ig-messages/repository"

const META_GRAPH_BASE = "https://graph.facebook.com"

// ─── Webhook verification (GET) ───────────────────────────────────────────────

export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")

  if (!mode || !token || !challenge) return new Response("Bad request", { status: 400 })
  if (mode !== "subscribe") return new Response("Forbidden", { status: 403 })

  // verify_token is page-scoped — find any active source that has this token
  const sourceRow = await db
    .select({ verifyToken: instagramMessageSources.verifyToken })
    .from(instagramMessageSources)
    .where(eq(instagramMessageSources.verifyToken, token))
    .limit(1)

  if (!sourceRow[0]) return new Response("Forbidden", { status: 403 })

  return new Response(challenge, { status: 200 })
}

// ─── Webhook receiver (POST) ──────────────────────────────────────────────────

export async function POST(req: Request) {
  const appSecret = process.env.META_APP_SECRET
  const rawBody = await req.text()

  if (appSecret) {
    const sig = req.headers.get("x-hub-signature-256") ?? ""
    const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex")
    if (sig !== expected) return new Response("Signature mismatch", { status: 403 })
  }

  let body: IgWebhookPayload
  try {
    body = JSON.parse(rawBody) as IgWebhookPayload
  } catch {
    return new Response("Bad JSON", { status: 400 })
  }

  if (body.object !== "instagram") return new Response("OK", { status: 200 })

  // Fire-and-forget so Meta doesn't timeout
  processEntries(body.entry).catch(() => undefined)

  return new Response("OK", { status: 200 })
}

// ─── Processing ───────────────────────────────────────────────────────────────

async function processEntries(entries: IgWebhookPayload["entry"]) {
  for (const entry of entries) {
    const pageId = entry.id
    for (const event of entry.messaging ?? []) {
      await processIgMessage(pageId, event).catch(() => undefined)
    }
  }
}

async function processIgMessage(pageId: string, event: IgMessagingEvent) {
  // Only process messages initiated from an ad
  if (event.referral?.source !== "ADS") return
  // Skip echo messages (sent by the page itself)
  if (!event.message || event.message.is_echo) return

  const igsid = event.sender.id
  const mid = event.message.mid

  // Find which org this page belongs to
  const source = await getIgMessageSourceByPageId(pageId)
  if (!source) return

  const orgId = source.orgId

  // Resolve campaign — catalog lookup first, then configured fallback on the source row
  let campaignInfo: { campaignId: string; metaCampaignId: string; metaAdsetId: string; adName: string; campaignName: string } | null = null

  if (event.referral.ad_id) {
    campaignInfo = await resolveIgCampaignFromAdId(orgId, event.referral.ad_id)
  }
  if (!campaignInfo && source.campaignId) {
    campaignInfo = { campaignId: source.campaignId, metaCampaignId: "", metaAdsetId: "", adName: "", campaignName: "" }
  }
  if (!campaignInfo) return // No campaign resolved — skip

  // Idempotency: check by (campaign_id, event_id) — same pattern as meta-leads webhook
  const existingEvent = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(and(
      eq(webhookEvents.campaignId, campaignInfo.campaignId),
      eq(webhookEvents.eventId, mid),
    ))
    .limit(1)
  if (existingEvent[0]) return

  // Fetch Instagram user profile for name
  let profileName: string | undefined
  if (source.pageAccessTokenEnc) {
    try {
      const token = decryptTokenVersioned(source.pageAccessTokenEnc)
      const apiVersion = process.env.META_GRAPH_API_VERSION ?? "v22.0"
      const res = await fetch(
        `${META_GRAPH_BASE}/${apiVersion}/${igsid}?fields=name,username&access_token=${token}`,
        { signal: AbortSignal.timeout(8_000) }
      )
      if (res.ok) {
        const profile = await res.json() as { name?: string; username?: string }
        profileName = profile.name ?? profile.username
      }
    } catch {
      // Profile fetch is best-effort — continue without name
    }
  }

  // Anchor idempotency — use orgId as proxy for campaignId scope since ig sources are org-scoped
  await db
    .insert(webhookEvents)
    .values({
      campaignId: campaignInfo.campaignId,
      eventId: mid,
      rawPayload: { source: "instagram_message", igsid, adId: event.referral.ad_id ?? null },
      processed: false,
    })
    .onConflictDoNothing()

  // Build notes from ad context + first message text
  const noteLines: string[] = []
  if (event.referral.ad_title) noteLines.push(`Anuncio: ${event.referral.ad_title}`)
  if (event.message.text) noteLines.push(`Primer mensaje: ${event.message.text}`)

  const [lead] = await db
    .insert(leads)
    .values({
      orgId,
      campaignId: campaignInfo.campaignId,
      name: profileName ?? `Instagram ${igsid.slice(-6)}`,
      leadSource: "instagram_message",
      platform: "instagram",
      temperature: "cold",
      stage: "new",
      externalEventId: mid,
      igScopedId: igsid,
      metaCampaignName: campaignInfo.campaignName || null,
      metaAdName: campaignInfo.adName || null,
      notes: noteLines.length ? noteLines.join("\n") : null,
    })
    .returning({ id: leads.id })
    .catch(() => [])

  if (!lead) return

  // Attribution touchpoint
  if (event.referral.ad_id) {
    await db
      .insert(leadAttributionTouchpoints)
      .values({
        leadId: lead.id,
        orgId,
        campaignId: campaignInfo.campaignId,
        touchType: "first_touch",
        channel: "paid_social",
        metaCampaignId: campaignInfo.metaCampaignId || null,
        metaAdsetId: campaignInfo.metaAdsetId || null,
        metaAdId: event.referral.ad_id,
      })
      .catch(() => undefined)
  }

  // Activity log
  await db
    .insert(leadActivities)
    .values({
      leadId: lead.id,
      orgId,
      actorType: "api",
      activityType: "created",
      metadata: { source: "instagram_message", igsid, hasName: !!profileName },
    })
    .catch(() => undefined)

  // Mark webhook processed
  await db
    .update(webhookEvents)
    .set({ processed: true })
    .where(and(eq(webhookEvents.campaignId, campaignInfo.campaignId), eq(webhookEvents.eventId, mid)))
    .catch(() => undefined)

  // Auto-qualify fire-and-forget
  autoQualifyLeadInternal(lead.id, orgId, campaignInfo.campaignId).catch(() => undefined)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface IgReferral {
  source: string      // "ADS"
  type?: string       // "AD"
  ad_id?: string
  ad_title?: string
  ref?: string
}

interface IgMessage {
  mid: string
  text?: string
  is_echo?: boolean
}

interface IgMessagingEvent {
  sender: { id: string }       // IGSID of the person who sent the message
  recipient: { id: string }    // Page ID
  timestamp: number
  message?: IgMessage
  referral?: IgReferral
}

interface IgWebhookPayload {
  object: string
  entry: Array<{
    id: string          // Page ID
    time: number
    messaging?: IgMessagingEvent[]
  }>
}

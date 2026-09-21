import "server-only"

import { eq, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { leads, webhookEvents, leadAttributionTouchpoints, leadActivities, metaConnections, campaigns, metaEvents } from "@/lib/db/schema"
import type { NormalizedLead } from "./normalize"
import { autoQualifyLeadInternal } from "@/domains/qualification/actions"
import { decryptTokenVersioned } from "@/lib/crypto"
import { sendMetaEventDirect } from "@/lib/meta-outbox/worker"

export interface PersistInput {
  credential: {
    credentialId: string
    orgId: string
    campaignId: string
  }
  lead: NormalizedLead
  ip: string | null
  userAgent: string | null
  source: "form" | "server" | "legacy_api"
}

export type PersistResult =
  | { kind: "created"; leadId: string }
  | { kind: "duplicate"; leadId?: string }
  | { kind: "error"; internalCode: string }

const IP_RETENTION_DAYS = 90
const UA_RETENTION_DAYS = 90

/**
 * Persists a validated lead with its first-touch attribution and initial activity.
 *
 * Idempotency: uses INSERT … ON CONFLICT DO NOTHING on webhook_events
 * (unique index on campaignId + eventId). If already processed → { kind: "duplicate" }.
 *
 * neon-http does not support interactive transactions, so operations are ordered
 * to leave detectable state on partial failure:
 *   1. webhook_events INSERT (idempotency anchor)
 *   2. leads INSERT
 *   3. lead_attribution_touchpoints INSERT (non-fatal)
 *   4. lead_activities INSERT (non-fatal)
 *   5. webhook_events UPDATE mark processed (non-fatal)
 */
export async function persistLead(input: PersistInput): Promise<PersistResult> {
  const { credential, lead, ip, userAgent, source } = input
  const { orgId, campaignId, credentialId } = credential

  const eventId = lead.externalEventId ?? crypto.randomUUID()

  const ipExpiresAt = ip ? new Date(Date.now() + IP_RETENTION_DAYS * 86_400_000) : null
  const uaExpiresAt = userAgent ? new Date(Date.now() + UA_RETENTION_DAYS * 86_400_000) : null

  // ─── 1. Idempotency anchor ────────────────────────────────────────────────────
  const [event] = await db
    .insert(webhookEvents)
    .values({
      campaignId,
      eventId,
      // Sanitized audit record — no PII stored here
      rawPayload: { source, credentialId, hasEmail: !!lead.email, hasPhone: !!lead.phone },
      processed: false,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id })

  if (!event) return { kind: "duplicate" }

  // ─── 2. Insert lead ───────────────────────────────────────────────────────────
  let leadId: string
  try {
    const [newLead] = await db
      .insert(leads)
      .values({
        orgId,
        campaignId,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        city: lead.city,
        negocio: lead.negocio,
        negocioRaw: lead.negocioRaw,
        negocioNormalized: lead.negocioNormalized,
        cityCanonical: lead.cityCanonical,
        leadSource: (lead.fbclid || lead.metaCampaignName) ? "meta_ads" : "organic",
        temperature: "cold",  // qualification profile sets the real temperature
        utmSource: lead.utmSource,
        utmMedium: lead.utmMedium,
        utmCampaign: lead.utmCampaign,
        utmContent: lead.utmContent,
        fbclid: lead.fbclid,
        fbc: lead.fbc,
        fbp: lead.fbp,
        landingUrl: lead.landingUrl,
        referrerUrl: lead.referrerUrl,
        metaCampaignName: lead.metaCampaignName,
        metaAdsetName: lead.metaAdsetName,
        metaAdName: lead.metaAdName,
        platform: lead.platform,
        device: lead.device,
        ip,
        ipExpiresAt,
        userAgent,
        uaExpiresAt,
        externalEventId: lead.externalEventId,
        eventId: lead.externalEventId, // @deprecated col kept in sync
      })
      .returning({ id: leads.id })

    leadId = newLead.id
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({ error: err instanceof Error ? err.name : "lead_insert_error" })
      .where(eq(webhookEvents.id, event.id))
      .catch(() => undefined)
    return { kind: "error", internalCode: "lead_insert_failed" }
  }

  // ─── 3. First-touch attribution (non-fatal) ───────────────────────────────────
  await db
    .insert(leadAttributionTouchpoints)
    .values({
      leadId,
      orgId,
      campaignId,
      touchType: "first_touch",
      channel: lead.utmMedium ?? (lead.fbclid ? "paid_social" : null),
      metaCampaignId: lead.metaCampaignId,
      metaAdsetId: lead.metaAdsetId,
      metaAdId: lead.metaAdId,
      utmSource: lead.utmSource,
      utmMedium: lead.utmMedium,
      utmCampaign: lead.utmCampaign,
      utmContent: lead.utmContent,
      fbclid: lead.fbclid,
      landingUrl: lead.landingUrl,
      referrerUrl: lead.referrerUrl,
    })
    .catch(() => undefined)

  // ─── 4. Initial activity — no PII in metadata ─────────────────────────────────
  await db
    .insert(leadActivities)
    .values({
      leadId,
      orgId,
      actorType: "api",
      activityType: "created",
      metadata: {
        source,
        channel: lead.utmMedium ?? (lead.fbclid ? "paid_social" : "direct"),
        temperature: lead.temperature,
        hasEmail: !!lead.email,
        hasPhone: !!lead.phone,
      },
    })
    .catch(() => undefined)

  // ─── 5. Mark processed ────────────────────────────────────────────────────────
  await db
    .update(webhookEvents)
    .set({ processed: true })
    .where(eq(webhookEvents.id, event.id))
    .catch(() => undefined)

  // ─── 6. Auto-qualification (non-fatal, fire-and-forget) ───────────────────────
  autoQualifyLeadInternal(leadId, orgId, campaignId).catch(() => undefined)

  // ─── 7. Lead CAPI event (non-fatal, fire-and-forget) ─────────────────────────
  ;(async () => {
    try {
      // Get the campaign's clientId
      const campaign = await db.query.campaigns.findFirst({
        where: and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)),
        columns: { clientId: true },
      })
      if (!campaign) return

      // Look up active meta_connection with sendLeadEvents enabled
      const conn = await db.query.metaConnections.findFirst({
        where: and(
          eq(metaConnections.clientId, campaign.clientId),
          eq(metaConnections.orgId, orgId),
          eq(metaConnections.status, "active"),
          eq(metaConnections.sendLeadEvents, true),
        ),
      })
      if (!conn?.pixelId || !conn.accessTokenEnc) return

      // Create meta_event row
      const eventId = `lead_${leadId}`
      const [insertedEvent] = await db
        .insert(metaEvents)
        .values({
          orgId,
          leadId,
          conversionId: null,
          pixelId: conn.pixelId,
          eventName: "Lead",
          eventId,
          payloadVersion: 1,
          payload: {
            event_name: "Lead",
            event_id: eventId,
            action_source: "website",
            event_time: Math.floor(Date.now() / 1000),
            // PII will be re-fetched by worker; payload is minimal for Lead events
            user_data: {},
          },
          status: "pending",
          attemptCount: 0,
          nextAttemptAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: metaEvents.id })

      if (!insertedEvent) return

      // Fire immediately — fire-and-forget
      sendMetaEventDirect(insertedEvent.id, orgId).catch(() => undefined)
    } catch {
      // Non-fatal — swallow all errors
    }
  })().catch(() => undefined)

  return { kind: "created", leadId }
}

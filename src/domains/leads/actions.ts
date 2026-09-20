"use server"

import type { Temperature, LeadStage } from "@/lib/db/schema"
import {
  updateLeadTemperature,
  updateLeadStage,
  updateLeadNotes,
  updateLeadInfo,
  assignLead,
  getLeadDetail,
} from "./repository"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { writeAuditLog } from "@/lib/audit"
import { db } from "@/lib/db"
import { leads, campaigns, metaConnections, metaEvents } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { sendMetaEventDirect } from "@/lib/meta-outbox/worker"

export async function updateLeadTemperatureAction(leadId: string, temperature: Temperature) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  await updateLeadTemperature(leadId, ctx.orgId, temperature, ctx.userId)
  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "lead.temperature.change",
    resourceType: "lead",
    resourceId: leadId,
    metadata: { temperature },
  }).catch(() => undefined)
  return { success: true }
}

export async function updateLeadStageAction(leadId: string, stage: LeadStage) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  await updateLeadStage(leadId, ctx.orgId, stage, ctx.userId)
  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "lead.stage.change",
    resourceType: "lead",
    resourceId: leadId,
    metadata: { stage },
  }).catch(() => undefined)

  // Fire Contact event when stage changes to "contacted" (non-blocking)
  if (stage === "contacted") {
    ;(async () => {
      try {
        const lead = await db.query.leads.findFirst({
          where: and(eq(leads.id, leadId), eq(leads.orgId, ctx.orgId)),
          columns: { campaignId: true, email: true, phone: true, name: true, city: true },
        })
        if (!lead) return

        const campaign = await db.query.campaigns.findFirst({
          where: and(eq(campaigns.id, lead.campaignId), eq(campaigns.orgId, ctx.orgId)),
          columns: { clientId: true },
        })
        if (!campaign) return

        const conn = await db.query.metaConnections.findFirst({
          where: and(
            eq(metaConnections.clientId, campaign.clientId),
            eq(metaConnections.orgId, ctx.orgId),
            eq(metaConnections.status, "active"),
            eq(metaConnections.sendContactEvents, true),
          ),
        })
        if (!conn?.pixelId || !conn.accessTokenEnc) return

        const eventId = `contact_${leadId}_${Date.now()}`
        const [insertedEvent] = await db
          .insert(metaEvents)
          .values({
            orgId: ctx.orgId,
            leadId,
            conversionId: null,
            pixelId: conn.pixelId,
            eventName: "Contact",
            eventId,
            payloadVersion: 1,
            payload: {
              event_name: "Contact",
              event_id: eventId,
              action_source: "website",
              event_time: Math.floor(Date.now() / 1000),
              user_data: {},
            },
            status: "pending",
            attemptCount: 0,
            nextAttemptAt: new Date(),
          })
          .onConflictDoNothing()
          .returning({ id: metaEvents.id })

        if (!insertedEvent) return
        sendMetaEventDirect(insertedEvent.id, ctx.orgId).catch(() => undefined)
      } catch {
        // Non-fatal
      }
    })().catch(() => undefined)
  }

  return { success: true }
}

export async function updateLeadNotesAction(leadId: string, notes: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  await updateLeadNotes(leadId, ctx.orgId, notes)
  return { success: true }
}

export async function assignLeadAction(leadId: string, assignedTo: string | null) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  await assignLead(leadId, ctx.orgId, assignedTo, ctx.userId)
  writeAuditLog({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "lead.assign",
    resourceType: "lead",
    resourceId: leadId,
    metadata: { assignedTo },
  }).catch(() => undefined)
  return { success: true }
}

export async function fetchLeadDetailAction(leadId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return null }
  return getLeadDetail(leadId, ctx.orgId)
}

export async function updateLeadInfoAction(
  leadId: string,
  data: { name?: string | null; email?: string | null; phone?: string | null; city?: string | null }
) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  await updateLeadInfo(leadId, ctx.orgId, data)
  return { success: true }
}

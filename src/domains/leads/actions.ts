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
import { requireOrganizationMembership, requireCampaignAccess } from "@/lib/auth/server"
import { writeAuditLog } from "@/lib/audit"
import { db } from "@/lib/db"
import { leads, campaigns, leadActivities, metaConnections, metaEvents } from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { sendMetaEventDirect } from "@/lib/meta-outbox/worker"
import { z } from "zod"
import { autoQualifyLeadInternal } from "@/domains/qualification/actions"

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
): Promise<{ success: boolean; error?: string }> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { success: false, error: "No autorizado" } }
  try {
    await updateLeadInfo(leadId, ctx.orgId, data)
    return { success: true }
  } catch {
    return { success: false, error: "Error al actualizar la información" }
  }
}

export async function deleteLeadsAction(
  leadIds: string[]
): Promise<{ error?: string; deleted?: number }> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  if (!leadIds.length) return { deleted: 0 }
  try {
    const deleted = await db
      .delete(leads)
      .where(and(eq(leads.orgId, ctx.orgId), inArray(leads.id, leadIds)))
      .returning({ id: leads.id })
    return { deleted: deleted.length }
  } catch {
    return { error: "Error al eliminar los leads." }
  }
}

export async function deleteLeadsByCampaignAction(
  campaignId: string
): Promise<{ error?: string; deleted?: number }> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  const camp = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, ctx.orgId)))
    .limit(1)
  if (!camp.length) return { error: "Campaña no encontrada." }
  try {
    const deleted = await db
      .delete(leads)
      .where(and(eq(leads.campaignId, campaignId), eq(leads.orgId, ctx.orgId)))
      .returning({ id: leads.id })
    return { deleted: deleted.length }
  } catch {
    return { error: "Error al eliminar los leads." }
  }
}

export async function deleteLeadsByClientAction(
  clientId: string
): Promise<{ error?: string; deleted?: number }> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  const clientCampaigns = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.clientId, clientId), eq(campaigns.orgId, ctx.orgId)))
  if (!clientCampaigns.length) return { deleted: 0 }
  const campaignIds = clientCampaigns.map((c) => c.id)
  try {
    const deleted = await db
      .delete(leads)
      .where(and(eq(leads.orgId, ctx.orgId), inArray(leads.campaignId, campaignIds)))
      .returning({ id: leads.id })
    return { deleted: deleted.length }
  } catch {
    return { error: "Error al eliminar los leads." }
  }
}

const CreateLeadSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(200),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email("Email inválido").max(300).optional().nullable().or(z.literal("")),
  city: z.string().max(100).optional().nullable(),
  negocio: z.string().max(500).optional().nullable(),
})

export async function createLeadManuallyAction(
  campaignId: string,
  input: unknown,
): Promise<{ success: boolean; leadId?: string; error?: string }> {
  let ctx
  try { ctx = await requireCampaignAccess(campaignId) } catch { return { success: false, error: "No autorizado" } }

  const parsed = CreateLeadSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }

  const { name, phone, city, negocio } = parsed.data
  const email = parsed.data.email || null

  try {
    const [lead] = await db
      .insert(leads)
      .values({
        orgId: ctx.orgId,
        campaignId,
        name: name.trim(),
        email,
        phone: phone?.trim() || null,
        city: city?.trim() || null,
        negocioRaw: negocio?.trim() || null,
        temperature: "cold",
        leadSource: "manual",
        stage: "new",
      })
      .returning({ id: leads.id })

    if (!lead) return { success: false, error: "Error al crear el lead" }

    await db
      .insert(leadActivities)
      .values({
        leadId: lead.id,
        orgId: ctx.orgId,
        actorType: "user",
        activityType: "created",
        metadata: { source: "manual", channel: "direct", hasEmail: !!email, hasPhone: !!phone },
      })
      .catch(() => undefined)

    autoQualifyLeadInternal(lead.id, ctx.orgId, campaignId).catch(() => undefined)

    return { success: true, leadId: lead.id }
  } catch {
    return { success: false, error: "Error al crear el lead" }
  }
}

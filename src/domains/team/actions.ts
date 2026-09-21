"use server"

import {
  requireOrganizationMembership,
  requireClientAccess,
  requireRole,
} from "@/lib/auth/server"
import {
  listSalesReps,
  getSalesRep,
  createSalesRep,
  updateSalesRep,
  deleteSalesRep,
  assignLeadToRep,
  unassignLead,
  getCurrentAssignment,
  getAssignmentHistory,
} from "./repository"
import {
  CreateSalesRepSchema,
  UpdateSalesRepSchema,
  AssignLeadSchema,
} from "./types"
import { requireCampaignAccess } from "@/lib/auth/server"
import { db } from "@/lib/db"
import { leads } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { sendLeadAssignmentEmail } from "@/lib/email"

// ─── Sales Reps ───────────────────────────────────────────────────────────────

export async function listSalesRepsAction(clientId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  try {
    await requireClientAccess(clientId)
  } catch { return { error: "No autorizado" } }
  const reps = await listSalesReps(ctx.orgId, clientId)
  return { data: reps }
}

export async function createSalesRepAction(input: unknown) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  try { await requireRole(["owner", "admin", "manager"]) } catch { return { error: "Permiso insuficiente" } }

  const parsed = CreateSalesRepSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  try {
    await requireClientAccess(parsed.data.clientId)
  } catch { return { error: "No autorizado" } }

  const rep = await createSalesRep(ctx.orgId, parsed.data)
  return { data: rep }
}

export async function updateSalesRepAction(id: string, input: unknown) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  try { await requireRole(["owner", "admin", "manager"]) } catch { return { error: "Permiso insuficiente" } }

  const parsed = UpdateSalesRepSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  const rep = await updateSalesRep(id, ctx.orgId, parsed.data)
  if (!rep) return { error: "Vendedor no encontrado" }
  return { data: rep }
}

export async function toggleSalesRepActiveAction(id: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  try { await requireRole(["owner", "admin", "manager"]) } catch { return { error: "Permiso insuficiente" } }

  const rep = await getSalesRep(id, ctx.orgId)
  if (!rep) return { error: "Vendedor no encontrado" }

  const updated = await updateSalesRep(id, ctx.orgId, { active: !rep.active })
  return { data: updated }
}

export async function deleteSalesRepAction(id: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  try { await requireRole(["owner", "admin", "manager"]) } catch { return { error: "Permiso insuficiente" } }

  try {
    await deleteSalesRep(id, ctx.orgId)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al eliminar" }
  }
}

// ─── Assignments ──────────────────────────────────────────────────────────────

export async function assignLeadAction(input: unknown) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  const parsed = AssignLeadSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  // Verify lead belongs to org (also fetch fields needed for email notification)
  const [lead] = await db
    .select({
      id: leads.id,
      campaignId: leads.campaignId,
      name: leads.name,
      phone: leads.phone,
      email: leads.email,
      metaCampaignName: leads.metaCampaignName,
    })
    .from(leads)
    .where(and(eq(leads.id, parsed.data.leadId), eq(leads.orgId, ctx.orgId)))
    .limit(1)
  if (!lead) return { error: "Lead no encontrado" }

  // manager+ can assign any lead; agent can only assign their own leads
  if (!["owner", "admin", "manager"].includes(ctx.role)) {
    // Agents can reassign leads they currently own (to themselves)
    const current = await getCurrentAssignment(parsed.data.leadId, ctx.orgId)
    const currentRepUserId = current?.salesRep ? null : null // resolved via userId
    if (parsed.data.salesRepId !== null) {
      // Agents cannot assign to others
      const [rep] = await db
        .select({ userId: (await import("@/lib/db/schema")).salesReps.userId })
        .from((await import("@/lib/db/schema")).salesReps)
        .where(
          and(
            eq((await import("@/lib/db/schema")).salesReps.id, parsed.data.salesRepId!),
            eq((await import("@/lib/db/schema")).salesReps.orgId, ctx.orgId),
          )
        )
        .limit(1)
      if (!rep || rep.userId !== ctx.userId) {
        return { error: "Solo puedes asignarte leads a ti mismo" }
      }
    }
  }

  try {
    const assignment = await assignLeadToRep(
      parsed.data.leadId,
      ctx.orgId,
      parsed.data.salesRepId,
      ctx.userId,
      parsed.data.reason,
      parsed.data.note,
    )

    // Fire-and-forget email notification to the assigned rep
    if (parsed.data.salesRepId) {
      const rep = await getSalesRep(parsed.data.salesRepId, ctx.orgId)
      if (rep?.email) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
        const leadUrl = `${appUrl}/dashboard/campaigns/${lead.campaignId}/leads?open=${lead.id}`
        sendLeadAssignmentEmail({
          to: rep.email,
          repName: rep.displayName,
          lead: {
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            metaCampaignName: lead.metaCampaignName,
          },
          dashboardUrl: leadUrl,
        }).catch(() => undefined)
      }
    }

    return { data: assignment }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al asignar" }
  }
}

export async function unassignLeadAction(leadId: string, reason?: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  try { await requireRole(["owner", "admin", "manager"]) } catch { return { error: "Permiso insuficiente" } }

  await unassignLead(leadId, ctx.orgId, ctx.userId, reason)
  return { success: true }
}

export async function getLeadAssignmentAction(leadId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return null }
  return getCurrentAssignment(leadId, ctx.orgId)
}

export async function getLeadAssignmentHistoryAction(leadId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return [] }
  return getAssignmentHistory(leadId, ctx.orgId)
}

export async function sendAssignmentEmailAction(leadId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  const [lead] = await db
    .select({
      id: leads.id,
      campaignId: leads.campaignId,
      name: leads.name,
      phone: leads.phone,
      email: leads.email,
      metaCampaignName: leads.metaCampaignName,
    })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.orgId, ctx.orgId)))
    .limit(1)
  if (!lead) return { error: "Lead no encontrado" }

  const assignment = await getCurrentAssignment(leadId, ctx.orgId)
  if (!assignment?.salesRepId) return { error: "El lead no tiene un vendedor asignado" }

  const rep = await getSalesRep(assignment.salesRepId, ctx.orgId)
  if (!rep?.email) return { error: "El vendedor no tiene email configurado" }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
    const leadUrl = `${appUrl}/dashboard/campaigns/${lead.campaignId}/leads?open=${lead.id}`
    await sendLeadAssignmentEmail({
      to: rep.email,
      repName: rep.displayName,
      lead: {
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        metaCampaignName: lead.metaCampaignName,
      },
      dashboardUrl: leadUrl,
    })
    return { success: true }
  } catch {
    return { error: "Error al enviar el email" }
  }
}

"use server"

import { requireOrganizationMembership, requireClientAccess, requireRole } from "@/lib/auth/server"
import {
  getWaClientConfig,
  upsertWaClientConfig,
  listMessageTemplates,
  createMessageTemplate,
  updateMessageTemplate,
  createWaLinkRecord,
  markMessageShared,
  correctManualConfirmation,
  markLeadContactedInternal,
  getWaMessages,
  buildWaLink,
  interpolateTemplate,
} from "./repository"
import {
  SaveWaClientConfigSchema,
  CreateMessageTemplateSchema,
  UpdateMessageTemplateSchema,
  PrepareWaLinkSchema,
  MarkMessageSharedSchema,
  CorrectConfirmationSchema,
} from "./types"
import { db } from "@/lib/db"
import { leads, messageTemplates, leadAssignments, salesReps } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

// ─── Client Config ────────────────────────────────────────────────────────────

export async function getWaClientConfigAction(clientId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return null }
  try { await requireClientAccess(clientId) } catch { return null }
  return getWaClientConfig(clientId, ctx.orgId)
}

export async function saveWaClientConfigAction(input: unknown) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  try { await requireRole(["owner", "admin"]) } catch { return { error: "Permiso insuficiente" } }

  const parsed = SaveWaClientConfigSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  try { await requireClientAccess(parsed.data.clientId) } catch { return { error: "No autorizado" } }

  const cfg = await upsertWaClientConfig(
    ctx.orgId,
    parsed.data.clientId,
    parsed.data.confirmationMode,
    parsed.data.providerName,
  )
  return { data: { clientId: cfg.clientId, confirmationMode: cfg.confirmationMode, providerName: cfg.providerName, hasProvider: Boolean(cfg.providerConfigEnc) } }
}

// ─── Message Templates ────────────────────────────────────────────────────────

export async function listMessageTemplatesAction(clientId: string, campaignId?: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  try { await requireClientAccess(clientId) } catch { return { error: "No autorizado" } }
  const rows = await listMessageTemplates(ctx.orgId, clientId, campaignId)
  return { data: rows }
}

export async function createMessageTemplateAction(input: unknown) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  try { await requireRole(["owner", "admin", "manager"]) } catch { return { error: "Permiso insuficiente" } }

  const parsed = CreateMessageTemplateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  try { await requireClientAccess(parsed.data.clientId) } catch { return { error: "No autorizado" } }

  const tmpl = await createMessageTemplate(ctx.orgId, {
    ...parsed.data,
    campaignId: parsed.data.campaignId ?? null,
    createdById: ctx.userId,
  })
  return { data: tmpl }
}

export async function updateMessageTemplateAction(id: string, input: unknown) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  try { await requireRole(["owner", "admin", "manager"]) } catch { return { error: "Permiso insuficiente" } }

  const parsed = UpdateMessageTemplateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  const tmpl = await updateMessageTemplate(id, ctx.orgId, parsed.data)
  if (!tmpl) return { error: "Plantilla no encontrada" }
  return { data: tmpl }
}

// ─── WhatsApp Flow ────────────────────────────────────────────────────────────

/**
 * Genera el enlace wa.me del lado del servidor con el teléfono del lead (PII controlada).
 * Crea un registro wa_messages con status = link_prepared.
 * NO marca el mensaje como enviado; eso requiere una acción explícita posterior.
 */
export async function prepareWaLinkAction(input: unknown) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  const parsed = PrepareWaLinkSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  // Fetch lead — includes phone (PII, server-side only)
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, parsed.data.leadId), eq(leads.orgId, ctx.orgId)))
    .limit(1)
  if (!lead) return { error: "Lead no encontrado" }
  if (!lead.phone) return { error: "El lead no tiene número de teléfono" }

  // Determine confirmation mode from client config
  const [campaign] = await db.query.campaigns.findMany
    ? await db.query.campaigns.findMany({ where: (c, { eq }) => eq(c.id, lead.campaignId) })
    : []
  const clientId = campaign?.clientId ?? null
  const waConfig = clientId ? await getWaClientConfig(clientId, ctx.orgId) : null
  const confirmationMode = waConfig?.confirmationMode ?? "manual"

  // Get current assignment
  const [currentAssignment] = await db
    .select({ id: leadAssignments.id, salesRepId: leadAssignments.salesRepId })
    .from(leadAssignments)
    .where(and(eq(leadAssignments.leadId, lead.id), eq(leadAssignments.isCurrent, true)))
    .limit(1)

  // Build message content from template (if provided)
  let messageContent = ""
  if (parsed.data.templateId) {
    const [tmpl] = await db
      .select()
      .from(messageTemplates)
      .where(and(eq(messageTemplates.id, parsed.data.templateId), eq(messageTemplates.orgId, ctx.orgId)))
      .limit(1)
    if (tmpl) {
      messageContent = interpolateTemplate(tmpl.content, tmpl.allowedVariables, parsed.data.variables)
    }
  }

  const waLink = buildWaLink(lead.phone, messageContent)

  const waMsg = await createWaLinkRecord({
    orgId: ctx.orgId,
    leadId: lead.id,
    assignmentId: currentAssignment?.id ?? null,
    templateId: parsed.data.templateId ?? null,
    sentById: ctx.userId,
    salesRepId: currentAssignment?.salesRepId ?? null,
    confirmationMode,
  })

  // Link is returned only to the authenticated user — never logged or stored
  return { data: { waLink, message: waMsg } }
}

export async function markMessageSharedAction(input: unknown) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  const parsed = MarkMessageSharedSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  try {
    const msg = await markMessageShared(parsed.data.messageId, ctx.orgId, ctx.userId, parsed.data.note)
    return { data: msg }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al confirmar" }
  }
}

export async function correctManualConfirmationAction(input: unknown) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  // Only manager+ can correct
  try { await requireRole(["owner", "admin", "manager"]) } catch { return { error: "Permiso insuficiente" } }

  const parsed = CorrectConfirmationSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  try {
    const msg = await correctManualConfirmation(parsed.data.messageId, ctx.orgId, ctx.userId, parsed.data.reason)
    return { data: msg }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al corregir" }
  }
}

export async function markLeadContactedAction(leadId: string, note?: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.orgId, ctx.orgId)))
    .limit(1)
  if (!lead) return { error: "Lead no encontrado" }

  await markLeadContactedInternal(leadId, ctx.orgId, ctx.userId, note)
  return { success: true }
}

export async function getLeadWaMessagesAction(leadId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return [] }
  return getWaMessages(leadId, ctx.orgId)
}

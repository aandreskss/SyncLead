"use server"

import { db } from "@/lib/db"
import { leadActivities, auditLogs } from "@/lib/db/schema"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { leads, campaigns, conversions, metaEvents } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { RegisterSaleSchema } from "./schema"
import { buildPurchasePayload } from "./payload"
import {
  createConversionIdempotent,
  createMetaEventIdempotent,
  getConversionByLeadId,
  getConversionById,
  getMetaEventByConversionId,
  resetMetaEventForRetry,
  cancelConversion,
  cancelPendingMetaEvents,
  syncLeadConvertedFields,
} from "./repository"
import { getActiveMetaConnectionByClientId } from "@/domains/meta/repository"
import { sendMetaEventDirect } from "@/lib/meta-outbox/worker"

// ─── Public type (safe to return to browser) ─────────────────────────────────

export type CAPIStatusPublic = {
  metaEventId: string
  status: "pending" | "processing" | "retrying" | "sent" | "failed" | "skipped" | "cancelled"
  attemptCount: number
  lastError: string | null
  lastResponse: string | null
  nextAttemptAt: Date | null
  pixelId: string | null
  sentAt: Date | null
}

export type ConversionStatusPublic = {
  conversionId: string
  orderId: string | null
  amount: string
  currency: string
  convertedAt: Date
  status: "confirmed" | "cancelled" | "refunded" | "pending"
  notes: string | null
  capi: CAPIStatusPublic | null
}

// ─── fetchConversionStatusAction ─────────────────────────────────────────────

export async function fetchConversionStatusAction(
  leadId: string
): Promise<ConversionStatusPublic | null> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return null }

  const conversion = await getConversionByLeadId(leadId, ctx.orgId)
  if (!conversion) return null

  const metaEvent = await getMetaEventByConversionId(conversion.id, ctx.orgId)

  return {
    conversionId: conversion.id,
    orderId: conversion.orderId,
    amount: conversion.amount,
    currency: conversion.currency,
    convertedAt: conversion.convertedAt,
    status: conversion.status,
    notes: conversion.notes,
    capi: metaEvent
      ? {
          metaEventId: metaEvent.id,
          status: metaEvent.status,
          attemptCount: metaEvent.attemptCount,
          lastError: metaEvent.lastError,
          lastResponse: metaEvent.lastResponse,
          nextAttemptAt: metaEvent.nextAttemptAt,
          pixelId: metaEvent.pixelId,
          sentAt: metaEvent.status === "sent" ? metaEvent.updatedAt : null,
        }
      : null,
  }
}

// ─── registerSaleAction ───────────────────────────────────────────────────────

export async function registerSaleAction(
  leadId: string,
  rawInput: {
    amount: number
    currency: string
    orderId: string
    convertedAt?: Date
    notes?: string
  }
): Promise<{
  success: boolean
  conversionId?: string
  duplicate?: boolean
  capiScheduled?: boolean
  capiStatus?: string
  error?: string
}> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch {
    return { success: false, error: "No autorizado" }
  }

  // Validate input
  const parsed = RegisterSaleSchema.safeParse(rawInput)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Datos inválidos"
    return { success: false, error: msg }
  }
  const input = parsed.data

  // Load lead (org-scoped)
  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), eq(leads.orgId, ctx.orgId)),
  })
  if (!lead) return { success: false, error: "Lead no encontrado" }

  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, lead.campaignId), eq(campaigns.orgId, ctx.orgId)),
  })

  // 1. Insert conversion (idempotency anchor on orgId + orderId)
  const { conversion, created } = await createConversionIdempotent({
    orgId: ctx.orgId,
    leadId,
    campaignId: campaign?.id ?? null,
    orderId: input.orderId,
    amount: input.amount.toFixed(2),
    currency: input.currency.toUpperCase(),
    convertedAt: input.convertedAt,
    actorId: ctx.userId,
    notes: input.notes ?? null,
  })

  if (!created) {
    // Idempotent repeat — return the existing conversion info
    return { success: true, duplicate: true, conversionId: conversion.id }
  }

  // 2. Build Purchase payload + create meta_event if connection exists
  let metaEventId: string | undefined
  let capiScheduled = false

  const metaConn = campaign
    ? await getActiveMetaConnectionByClientId(campaign.clientId, ctx.orgId)
    : undefined

  if (metaConn?.pixelId) {
    const event = buildPurchasePayload({
      conversionId: conversion.id,
      lead: {
        email: lead.email,
        phone: lead.phone,
        name: lead.name,
        city: lead.city,
        fbc: lead.fbc,
        fbp: lead.fbp,
        ip: lead.ip,
        userAgent: lead.userAgent,
        landingUrl: lead.landingUrl,
      },
      amount: input.amount.toFixed(2),
      currency: input.currency.toUpperCase(),
      orderId: input.orderId,
      convertedAt: input.convertedAt,
    })

    const { metaEvent } = await createMetaEventIdempotent({
      orgId: ctx.orgId,
      leadId,
      conversionId: conversion.id,
      pixelId: metaConn.pixelId,
      event,
    })
    metaEventId = metaEvent.id
    capiScheduled = true
  }

  // 3. Sync deprecated lead fields (non-fatal — for backward-compat UI)
  syncLeadConvertedFields(
    leadId, ctx.orgId,
    input.amount.toFixed(2), input.currency.toUpperCase(),
    input.convertedAt, ctx.userId
  ).catch(() => undefined)

  // 4. Activity log (non-fatal)
  db.insert(leadActivities).values({
    leadId,
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    activityType: "converted",
    metadata: { conversionId: conversion.id, orderId: input.orderId, capiScheduled },
  }).catch(() => undefined)

  // 5. Audit log (non-fatal)
  db.insert(auditLogs).values({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "conversion.created",
    resourceType: "conversion",
    resourceId: conversion.id,
    metadata: { leadId, orderId: input.orderId, amount: input.amount.toFixed(2), currency: input.currency },
  }).catch(() => undefined)

  // 6. Immediate best-effort CAPI send (non-blocking to sale success)
  let capiStatus: string | undefined
  if (metaEventId) {
    const sendResult = await sendMetaEventDirect(metaEventId, ctx.orgId).catch(() => null)
    capiStatus = sendResult?.status
  }

  return { success: true, conversionId: conversion.id, capiScheduled, capiStatus }
}

// ─── retryCAPIAction ──────────────────────────────────────────────────────────

export async function retryCAPIAction(
  conversionId: string
): Promise<{ success: boolean; error?: string }> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch {
    return { success: false, error: "No autorizado" }
  }

  const conversion = await getConversionById(conversionId, ctx.orgId)
  if (!conversion) return { success: false, error: "Conversión no encontrada" }

  const metaEvent = await getMetaEventByConversionId(conversionId, ctx.orgId)
  if (!metaEvent) return { success: false, error: "Sin evento Meta asociado" }
  if (metaEvent.status === "sent") return { success: false, error: "El evento ya fue enviado" }
  if (metaEvent.status === "cancelled") return { success: false, error: "El evento fue cancelado" }

  // Reset to pending so the cron (or immediate worker) picks it up
  await resetMetaEventForRetry(metaEvent.id, ctx.orgId)

  // Immediate best-effort send
  sendMetaEventDirect(metaEvent.id, ctx.orgId).catch(() => undefined)

  return { success: true }
}

// ─── cancelConversionAction ───────────────────────────────────────────────────

export async function cancelConversionAction(
  conversionId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch {
    return { success: false, error: "No autorizado" }
  }

  const conversion = await getConversionById(conversionId, ctx.orgId)
  if (!conversion) return { success: false, error: "Conversión no encontrada" }
  if (conversion.status !== "confirmed") {
    return { success: false, error: `No se puede cancelar una conversión en estado '${conversion.status}'` }
  }

  // Cancel conversion record
  await cancelConversion(conversionId, ctx.orgId, reason ?? "Cancelada por el usuario")

  // Cancel any pending meta events — no cancellation event is sent to Meta
  // (semantics of cancellation events are not yet defined)
  await cancelPendingMetaEvents(conversionId, ctx.orgId)

  await db.insert(auditLogs).values({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    actorType: "user",
    action: "conversion.cancelled",
    resourceType: "conversion",
    resourceId: conversionId,
    metadata: { reason: reason ?? "Cancelada por el usuario" },
  }).catch(() => undefined)

  return { success: true }
}

"use server"

import type { Temperature, LeadStage } from "@/lib/db/schema"
import {
  updateLeadTemperature,
  updateLeadStage,
  updateLeadNotes,
  assignLead,
  getLeadDetail,
} from "./repository"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { writeAuditLog } from "@/lib/audit"

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

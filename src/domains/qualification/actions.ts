"use server"

import { requireOrganizationMembership } from "@/lib/auth/server"
import { evaluateLead } from "./engine"
import { isSavayaRulesV1 } from "./types"
import {
  getActiveRuleSetByClientId,
  getRuleSetById,
  createQualification,
  createRuleSet,
  deactivateRuleSetsByClient,
  listRuleSetsByOrg,
  getQualificationsForLead,
  getEffectiveQualification,
} from "./repository"
import { db } from "@/lib/db"
import { leads, campaigns, conversions } from "@/lib/db/schema"
import { eq, and, ne } from "drizzle-orm"
import type { QualificationClass } from "./types"
import {
  getActiveProfileForCampaign,
  getFieldDefsForOrg,
  getEventDataForLead,
  persistProfileEvaluation,
} from "./profile-repository"
import { buildLeadContext, evaluateProfile } from "./score-engine"

// ─── Auto-qualification (called server-side at ingest) ────────────────────────

/**
 * Evaluates a lead against the active profile (v2) or rule set (v1 fallback).
 * Precedence: campaign.profileId → client published profile → org published profile
 *             → old rule_set (savaya_v1 fallback) → no evaluation.
 * Fire-and-forget: never throws — caller wraps in .catch(() => undefined).
 * Does NOT require session auth — called from the ingest pipeline (server-only).
 */
export async function autoQualifyLeadInternal(
  leadId: string,
  orgId: string,
  campaignId: string,
): Promise<void> {
  try {
    // ── Step 1: Try profile-based evaluation (v2) ───────────────────────────
    const activeProfile = await getActiveProfileForCampaign(orgId, campaignId).catch(() => null)

    if (activeProfile) {
      // Load lead data
      const [lead] = await db
        .select({
          name: leads.name,
          city: leads.city,
          negocioRaw: leads.negocioRaw,
          negocioNormalized: leads.negocioNormalized,
          cityCanonical: leads.cityCanonical,
          utmSource: leads.utmSource,
          utmMedium: leads.utmMedium,
          utmCampaign: leads.utmCampaign,
          platform: leads.platform,
          device: leads.device,
          fbclid: leads.fbclid,
          customData: leads.customData,
          campaignId: leads.campaignId,
        })
        .from(leads)
        .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
        .limit(1)

      if (!lead) return

      const [campaign] = await db
        .select({ clientId: campaigns.clientId })
        .from(campaigns)
        .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
        .limit(1)

      if (!campaign) return

      const fieldDefsMap = await getFieldDefsForOrg(orgId, campaign.clientId)
      const fieldDefs = Object.values(fieldDefsMap)
      const eventData = await getEventDataForLead(leadId, orgId).catch(() => ({}))

      const evalContext = buildLeadContext(
        {
          name: lead.name,
          city: lead.city,
          cityCanonical: lead.cityCanonical,
          negocioRaw: lead.negocioRaw,
          negocioNormalized: lead.negocioNormalized,
          utmSource: lead.utmSource,
          utmMedium: lead.utmMedium,
          utmCampaign: lead.utmCampaign,
          platform: lead.platform,
          device: lead.device,
          fbclid: lead.fbclid,
          customData: (lead.customData ?? {}) as Record<string, unknown>,
        },
        fieldDefs,
        eventData,
      )
      const result = evaluateProfile(activeProfile.profile, activeProfile.rules, evalContext, fieldDefs)

      await persistProfileEvaluation(leadId, orgId, activeProfile.profile.id, result, "ingest")
      return
    }

    // ── Step 2: Fallback to rule-set engine (v1 / savaya_v1) ───────────────
    const [campaign] = await db
      .select({ clientId: campaigns.clientId })
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
      .limit(1)

    if (!campaign) return

    const ruleSet = await getActiveRuleSetByClientId(orgId, campaign.clientId)

    if (ruleSet && isSavayaRulesV1(ruleSet.rules)) {
      const [lead] = await db
        .select({
          negocioRaw: leads.negocioRaw,
          cityRaw: leads.city,
        })
        .from(leads)
        .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
        .limit(1)

      if (!lead) return

      const evaluation = evaluateLead(
        { negocioRaw: lead.negocioRaw, cityRaw: lead.cityRaw },
        ruleSet.rules,
      )

      await createQualification({
        leadId,
        orgId,
        ruleSetId: ruleSet.id,
        ruleSetVersion: ruleSet.version,
        qualClass: evaluation.class,
        qualType: "automatic",
        reasons: evaluation.reasons,
        inputs: evaluation.inputs,
      })
      return
    }

    // No profile and no rule set — behavior signals handled in finally block.
  } finally {
    // ── Safety net A: Behavior signals always upgrade, never downgrade ────────
    // Runs after EVERY evaluation path (profile, savaya_v1, or no config).
    // This ensures cart abandonment, form submission, etc. promote temperature
    // even when a rule set evaluated the lead as cold based on field data alone.
    const eventData = await getEventDataForLead(leadId, orgId).catch((): Record<string, unknown> => ({}))

    if (eventData.ecom_purchased) {
      await db
        .update(leads)
        .set({ temperature: "hot", updatedAt: new Date() })
        .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId), ne(leads.temperature, "hot")))
        .catch(() => undefined)
    } else {
      const hasEngagement =
        eventData.ecom_form_submitted ||
        eventData.ecom_checkout_started ||
        eventData.ecom_cart_abandoned

      if (hasEngagement) {
        await db
          .update(leads)
          .set({ temperature: "warm", updatedAt: new Date() })
          .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId), eq(leads.temperature, "cold")))
          .catch(() => undefined)
      }
    }

    // ── Safety net B: Confirmed sale always wins ──────────────────────────────
    const [confirmedSale] = await db
      .select({ id: conversions.id })
      .from(conversions)
      .where(
        and(
          eq(conversions.leadId, leadId),
          eq(conversions.orgId, orgId),
          eq(conversions.status, "confirmed"),
        ),
      )
      .limit(1)
      .catch(() => [] as { id: string }[])

    if (confirmedSale) {
      await db
        .update(leads)
        .set({ temperature: "hot", updatedAt: new Date() })
        .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId), ne(leads.temperature, "hot")))
        .catch(() => undefined)
    }
  }
}

// ─── Manual override ──────────────────────────────────────────────────────────

export async function submitManualQualificationAction(
  leadId: string,
  qualClass: QualificationClass,
  note: string | null,
) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  // Verify lead belongs to org
  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.orgId, ctx.orgId)))
    .limit(1)

  if (!lead) return { error: "Lead no encontrado" }

  const VALID_CLASSES: QualificationClass[] = ["hot", "warm", "cold", "unqualified"]
  if (!VALID_CLASSES.includes(qualClass)) return { error: "Clase no válida" }

  await createQualification({
    leadId,
    orgId: ctx.orgId,
    ruleSetId: null,
    ruleSetVersion: 0,
    qualClass,
    qualType: "manual",
    reasons: note ? [note] : ["Calificación manual sin razón especificada."],
    inputs: { negocioRaw: null, negocioNormalized: null, cityRaw: null, cityCanonical: null },
    note: note ?? null,
    actorId: ctx.userId,
  })

  return { success: true }
}

// ─── Re-evaluate single lead ──────────────────────────────────────────────────

export async function evaluateLeadAction(leadId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  const [lead] = await db
    .select({
      id: leads.id,
      campaignId: leads.campaignId,
      negocioRaw: leads.negocioRaw,
      cityRaw: leads.city,
    })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.orgId, ctx.orgId)))
    .limit(1)

  if (!lead) return { error: "Lead no encontrado" }

  const [campaign] = await db
    .select({ clientId: campaigns.clientId })
    .from(campaigns)
    .where(and(eq(campaigns.id, lead.campaignId), eq(campaigns.orgId, ctx.orgId)))
    .limit(1)

  if (!campaign) return { error: "Campaña no encontrada" }

  const ruleSet = await getActiveRuleSetByClientId(ctx.orgId, campaign.clientId)
  if (!ruleSet) return { error: "No hay reglas activas para este cliente" }
  if (!isSavayaRulesV1(ruleSet.rules)) return { error: "Tipo de regla no reconocido" }

  const evaluation = evaluateLead(
    { negocioRaw: lead.negocioRaw, cityRaw: lead.cityRaw },
    ruleSet.rules,
  )

  await createQualification({
    leadId,
    orgId: ctx.orgId,
    ruleSetId: ruleSet.id,
    ruleSetVersion: ruleSet.version,
    qualClass: evaluation.class,
    qualType: "automatic",
    reasons: evaluation.reasons,
    inputs: evaluation.inputs,
  })

  return { success: true, class: evaluation.class, reasons: evaluation.reasons }
}

// ─── Batch re-evaluation ──────────────────────────────────────────────────────

export interface BatchPreviewResult {
  total: number
  byClass: Record<QualificationClass, number>
  manualOverridesSkipped: number
}

/**
 * Previews what a batch re-evaluation would produce WITHOUT writing anything.
 * Scoped to a single client. Manual overrides are shown but not counted in byClass
 * because they won't be replaced.
 */
export async function previewBatchReEvaluationAction(
  clientId: string,
  ruleSetId: string,
): Promise<{ error: string } | { data: BatchPreviewResult }> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  const ruleSet = await getRuleSetById(ctx.orgId, ruleSetId)
  if (!ruleSet) return { error: "Regla no encontrada" }
  if (!isSavayaRulesV1(ruleSet.rules)) return { error: "Tipo de regla no reconocido" }

  // Fetch all leads for the client's campaigns
  const clientLeads = await db
    .select({
      id: leads.id,
      negocioRaw: leads.negocioRaw,
      cityRaw: leads.city,
    })
    .from(leads)
    .innerJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(and(eq(campaigns.clientId, clientId), eq(leads.orgId, ctx.orgId)))

  const byClass: Record<QualificationClass, number> = {
    hot: 0, warm: 0, cold: 0, unqualified: 0,
  }
  let manualOverridesSkipped = 0

  for (const lead of clientLeads) {
    // Check if this lead has a manual override (skip — don't replace)
    const { manual } = await getEffectiveQualification(lead.id, ctx.orgId)
    if (manual) {
      manualOverridesSkipped++
      continue
    }
    const evaluation = evaluateLead(
      { negocioRaw: lead.negocioRaw, cityRaw: lead.cityRaw },
      ruleSet.rules,
    )
    byClass[evaluation.class]++
  }

  return {
    data: {
      total: clientLeads.length,
      byClass,
      manualOverridesSkipped,
    },
  }
}

/**
 * Applies a batch re-evaluation for all leads in a client.
 * Manual overrides are preserved — only automatic qualification is refreshed.
 * Each evaluation is traced with the rule_set_id and version.
 */
export async function applyBatchReEvaluationAction(
  clientId: string,
  ruleSetId: string,
): Promise<{ error: string } | { applied: number; skipped: number }> {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  const ruleSet = await getRuleSetById(ctx.orgId, ruleSetId)
  if (!ruleSet) return { error: "Regla no encontrada" }
  if (!isSavayaRulesV1(ruleSet.rules)) return { error: "Tipo de regla no reconocido" }

  const clientLeads = await db
    .select({
      id: leads.id,
      negocioRaw: leads.negocioRaw,
      cityRaw: leads.city,
    })
    .from(leads)
    .innerJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .where(and(eq(campaigns.clientId, clientId), eq(leads.orgId, ctx.orgId)))

  let applied = 0
  let skipped = 0

  for (const lead of clientLeads) {
    const { manual } = await getEffectiveQualification(lead.id, ctx.orgId)
    if (manual) {
      skipped++
      continue
    }
    const evaluation = evaluateLead(
      { negocioRaw: lead.negocioRaw, cityRaw: lead.cityRaw },
      ruleSet.rules,
    )
    await createQualification({
      leadId: lead.id,
      orgId: ctx.orgId,
      ruleSetId: ruleSet.id,
      ruleSetVersion: ruleSet.version,
      qualClass: evaluation.class,
      qualType: "automatic",
      reasons: evaluation.reasons,
      inputs: evaluation.inputs,
    }).catch(() => undefined)

    applied++
  }

  return { applied, skipped }
}

// ─── Rule set management ──────────────────────────────────────────────────────

export async function createRuleSetAction(input: {
  clientId: string | null
  name: string
  rules: Record<string, unknown>
}) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }

  if (!isSavayaRulesV1(input.rules)) return { error: "Formato de reglas no válido" }

  // Deactivate existing rule sets for this scope before creating the new one
  await deactivateRuleSetsByClient(ctx.orgId, input.clientId)

  const row = await createRuleSet({
    orgId: ctx.orgId,
    clientId: input.clientId,
    name: input.name,
    version: 1,
    rules: input.rules,
    isActive: true,
  })

  return { success: true, ruleSetId: row.id }
}

export async function listRuleSetsAction() {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  return listRuleSetsByOrg(ctx.orgId)
}

export async function deactivateClientRuleSetsAction(clientId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  await deactivateRuleSetsByClient(ctx.orgId, clientId)
  return { success: true }
}

export async function getLeadQualificationsAction(leadId: string) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return { error: "No autorizado" } }
  return getQualificationsForLead(leadId, ctx.orgId)
}

import "server-only"

import { eq, and, desc, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  qualificationRuleSets,
  leadQualifications,
  leads,
  type NewQualificationRuleSet,
} from "@/lib/db/schema"
import { isSavayaRulesV1 } from "./types"
import type { QualificationClass, QualificationType, QualificationInputs } from "./types"

// ─── Rule Set queries ─────────────────────────────────────────────────────────

/** Returns the active rule set for a client (falls back to org-wide if none). */
export async function getActiveRuleSetByClientId(
  orgId: string,
  clientId: string,
): Promise<{ id: string; version: number; rules: Record<string, unknown> } | null> {
  // Prefer client-scoped rule set; fall back to org-wide (clientId IS NULL)
  const rows = await db
    .select({
      id: qualificationRuleSets.id,
      version: qualificationRuleSets.version,
      rules: qualificationRuleSets.rules,
      clientId: qualificationRuleSets.clientId,
    })
    .from(qualificationRuleSets)
    .where(
      and(
        eq(qualificationRuleSets.orgId, orgId),
        eq(qualificationRuleSets.isActive, true),
      )
    )
    .orderBy(desc(qualificationRuleSets.createdAt))

  // Client-scoped first
  const clientRow = rows.find((r) => r.clientId === clientId)
  if (clientRow) return clientRow

  // Org-wide fallback
  const orgRow = rows.find((r) => r.clientId === null)
  return orgRow ?? null
}

export async function getRuleSetById(
  orgId: string,
  ruleSetId: string,
): Promise<{ id: string; version: number; rules: Record<string, unknown> } | null> {
  const [row] = await db
    .select({
      id: qualificationRuleSets.id,
      version: qualificationRuleSets.version,
      rules: qualificationRuleSets.rules,
    })
    .from(qualificationRuleSets)
    .where(
      and(
        eq(qualificationRuleSets.orgId, orgId),
        eq(qualificationRuleSets.id, ruleSetId),
      )
    )
    .limit(1)

  return row ?? null
}

export async function createRuleSet(
  input: Omit<NewQualificationRuleSet, "id" | "createdAt" | "updatedAt">,
) {
  const [row] = await db
    .insert(qualificationRuleSets)
    .values(input)
    .returning({ id: qualificationRuleSets.id })
  return row
}

export async function deactivateRuleSetsByClient(
  orgId: string,
  clientId: string | null,
) {
  await db
    .update(qualificationRuleSets)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      clientId
        ? and(
            eq(qualificationRuleSets.orgId, orgId),
            eq(qualificationRuleSets.clientId, clientId),
            eq(qualificationRuleSets.isActive, true),
          )
        : and(
            eq(qualificationRuleSets.orgId, orgId),
            eq(qualificationRuleSets.isActive, true),
          )
    )
}

export async function listRuleSetsByOrg(orgId: string) {
  return db
    .select()
    .from(qualificationRuleSets)
    .where(eq(qualificationRuleSets.orgId, orgId))
    .orderBy(desc(qualificationRuleSets.createdAt))
}

// ─── Qualification record queries ─────────────────────────────────────────────

export interface QualificationRecord {
  id: string
  leadId: string
  ruleSetId: string | null
  ruleSetVersion: number
  qualClass: QualificationClass
  qualType: QualificationType
  reasons: string[]
  inputs: QualificationInputs
  note: string | null
  actorId: string | null
  evaluatedAt: Date
}

/** Returns all qualification records for a lead, newest first. */
export async function getQualificationsForLead(
  leadId: string,
  orgId: string,
): Promise<QualificationRecord[]> {
  const rows = await db
    .select()
    .from(leadQualifications)
    .where(
      and(
        eq(leadQualifications.leadId, leadId),
        eq(leadQualifications.orgId, orgId),
      )
    )
    .orderBy(desc(leadQualifications.evaluatedAt))

  return rows.map((r) => ({
    id: r.id,
    leadId: r.leadId,
    ruleSetId: r.ruleSetId,
    ruleSetVersion: r.ruleSetVersion,
    qualClass: r.qualClass as QualificationClass,
    qualType: r.qualType as QualificationType,
    reasons: (r.reasons as string[]) ?? [],
    inputs: (r.inputs as QualificationInputs) ?? { negocioRaw: null, negocioNormalized: null, cityRaw: null, cityCanonical: null },
    note: r.note,
    actorId: r.actorId,
    evaluatedAt: r.evaluatedAt,
  }))
}

/** Latest automatic and manual qualifications, used to compute effective_qual_class. */
export async function getEffectiveQualification(
  leadId: string,
  orgId: string,
): Promise<{ automatic: QualificationRecord | null; manual: QualificationRecord | null }> {
  const all = await getQualificationsForLead(leadId, orgId)
  return {
    manual: all.find((q) => q.qualType === "manual") ?? null,
    automatic: all.find((q) => q.qualType === "automatic") ?? null,
  }
}

// ─── Write helpers ────────────────────────────────────────────────────────────

export interface CreateQualificationInput {
  leadId: string
  orgId: string
  ruleSetId: string | null
  ruleSetVersion: number
  qualClass: QualificationClass
  qualType: QualificationType
  reasons: string[]
  inputs: QualificationInputs
  note?: string | null
  actorId?: string | null
}

/** Inserts a qualification record and refreshes effective_qual_class on the lead. */
export async function createQualification(input: CreateQualificationInput): Promise<string> {
  const [row] = await db
    .insert(leadQualifications)
    .values({
      leadId: input.leadId,
      orgId: input.orgId,
      ruleSetId: input.ruleSetId,
      ruleSetVersion: input.ruleSetVersion,
      qualClass: input.qualClass,
      qualType: input.qualType,
      reasons: input.reasons,
      inputs: input.inputs,
      note: input.note ?? null,
      actorId: input.actorId ?? null,
    })
    .returning({ id: leadQualifications.id })

  // Refresh the effective_qual_class cache on the lead
  await refreshEffectiveQualClass(input.leadId, input.orgId).catch(() => undefined)

  return row.id
}

/**
 * Recomputes effective_qual_class = manual ?? automatic and writes it to leads.
 * Also syncs leads.temperature when the effective class maps to a temperature value
 * (hot/warm/cold). "unqualified" and null do not touch temperature.
 * Non-fatal — caller should .catch(() => undefined) if firing in background.
 */
export async function refreshEffectiveQualClass(
  leadId: string,
  orgId: string,
): Promise<void> {
  const { manual, automatic } = await getEffectiveQualification(leadId, orgId)
  const effectiveClass = manual?.qualClass ?? automatic?.qualClass ?? null

  const temperatureMap: Partial<Record<string, "hot" | "warm" | "cold">> = {
    hot: "hot",
    warm: "warm",
    cold: "cold",
  }
  const newTemperature = effectiveClass ? temperatureMap[effectiveClass] : undefined

  // Always update the effectiveQualClass cache
  await db
    .update(leads)
    .set({ effectiveQualClass: effectiveClass, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))

  // Update temperature, but never downgrade a lead that was promoted to hot by a
  // confirmed sale — a re-qualification of "cold" must not erase a purchase signal.
  if (newTemperature) {
    await db
      .update(leads)
      .set({ temperature: newTemperature })
      .where(
        newTemperature === "hot"
          ? and(eq(leads.id, leadId), eq(leads.orgId, orgId))
          : and(eq(leads.id, leadId), eq(leads.orgId, orgId), ne(leads.temperature, "hot")),
      )
      .catch(() => undefined)
  }
}

// ─── Validation helper ────────────────────────────────────────────────────────

/** Returns true if the stored rules JSON is a recognised rule set type. */
export function validateRuleSetRules(rules: Record<string, unknown>): boolean {
  return isSavayaRulesV1(rules)
}

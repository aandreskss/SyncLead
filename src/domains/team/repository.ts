import { db } from "@/lib/db"
import { leads, salesReps, leadAssignments, leadActivities } from "@/lib/db/schema"
import { eq, and, isNull, desc } from "drizzle-orm"
import type { CreateSalesRepInput, UpdateSalesRepInput, AssignmentWithRep } from "./types"

// ─── Sales Reps ───────────────────────────────────────────────────────────────

export async function listSalesReps(orgId: string, clientId: string) {
  return db
    .select()
    .from(salesReps)
    .where(and(eq(salesReps.orgId, orgId), eq(salesReps.clientId, clientId)))
    .orderBy(salesReps.displayName)
}

export async function listSalesRepsByOrg(orgId: string) {
  return db
    .select()
    .from(salesReps)
    .where(eq(salesReps.orgId, orgId))
    .orderBy(salesReps.displayName)
}

export async function getSalesRep(id: string, orgId: string) {
  const rows = await db
    .select()
    .from(salesReps)
    .where(and(eq(salesReps.id, id), eq(salesReps.orgId, orgId)))
    .limit(1)
  return rows[0] ?? null
}

export async function createSalesRep(orgId: string, data: CreateSalesRepInput) {
  const rows = await db
    .insert(salesReps)
    .values({
      orgId,
      clientId: data.clientId,
      displayName: data.displayName,
      email: data.email ?? null,
      whatsappNumber: data.whatsappNumber ?? null,
      userId: data.userId ?? null,
    })
    .returning()
  return rows[0]!
}

export async function updateSalesRep(id: string, orgId: string, data: UpdateSalesRepInput) {
  const rows = await db
    .update(salesReps)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(salesReps.id, id), eq(salesReps.orgId, orgId)))
    .returning()
  return rows[0] ?? null
}

export async function deleteSalesRep(id: string, orgId: string) {
  // Only delete if no current assignment references this rep
  const current = await db
    .select({ id: leadAssignments.id })
    .from(leadAssignments)
    .where(
      and(
        eq(leadAssignments.salesRepId, id),
        eq(leadAssignments.isCurrent, true),
      )
    )
    .limit(1)
  if (current.length > 0) {
    throw new Error("No se puede eliminar un vendedor con leads asignados actualmente")
  }
  await db
    .delete(salesReps)
    .where(and(eq(salesReps.id, id), eq(salesReps.orgId, orgId)))
}

// ─── Assignments ──────────────────────────────────────────────────────────────

export async function getCurrentAssignment(leadId: string, orgId: string): Promise<AssignmentWithRep | null> {
  const rows = await db
    .select({
      id: leadAssignments.id,
      leadId: leadAssignments.leadId,
      salesRepId: leadAssignments.salesRepId,
      assignedById: leadAssignments.assignedById,
      reason: leadAssignments.reason,
      note: leadAssignments.note,
      isCurrent: leadAssignments.isCurrent,
      assignedAt: leadAssignments.assignedAt,
      unassignedAt: leadAssignments.unassignedAt,
      repId: salesReps.id,
      repDisplayName: salesReps.displayName,
      repWhatsappNumber: salesReps.whatsappNumber,
      repActive: salesReps.active,
    })
    .from(leadAssignments)
    .leftJoin(salesReps, eq(salesReps.id, leadAssignments.salesRepId))
    .where(
      and(
        eq(leadAssignments.leadId, leadId),
        eq(leadAssignments.orgId, orgId),
        eq(leadAssignments.isCurrent, true),
      )
    )
    .limit(1)

  if (!rows[0]) return null
  const r = rows[0]
  return {
    id: r.id,
    leadId: r.leadId,
    salesRepId: r.salesRepId,
    assignedById: r.assignedById,
    reason: r.reason,
    note: r.note,
    isCurrent: r.isCurrent,
    assignedAt: r.assignedAt,
    unassignedAt: r.unassignedAt,
    salesRep: r.repId
      ? { id: r.repId, displayName: r.repDisplayName!, whatsappNumber: r.repWhatsappNumber, active: r.repActive! }
      : null,
  }
}

export async function getAssignmentHistory(leadId: string, orgId: string): Promise<AssignmentWithRep[]> {
  const rows = await db
    .select({
      id: leadAssignments.id,
      leadId: leadAssignments.leadId,
      salesRepId: leadAssignments.salesRepId,
      assignedById: leadAssignments.assignedById,
      reason: leadAssignments.reason,
      note: leadAssignments.note,
      isCurrent: leadAssignments.isCurrent,
      assignedAt: leadAssignments.assignedAt,
      unassignedAt: leadAssignments.unassignedAt,
      repId: salesReps.id,
      repDisplayName: salesReps.displayName,
      repWhatsappNumber: salesReps.whatsappNumber,
      repActive: salesReps.active,
    })
    .from(leadAssignments)
    .leftJoin(salesReps, eq(salesReps.id, leadAssignments.salesRepId))
    .where(and(eq(leadAssignments.leadId, leadId), eq(leadAssignments.orgId, orgId)))
    .orderBy(desc(leadAssignments.assignedAt))

  return rows.map((r) => ({
    id: r.id,
    leadId: r.leadId,
    salesRepId: r.salesRepId,
    assignedById: r.assignedById,
    reason: r.reason,
    note: r.note,
    isCurrent: r.isCurrent,
    assignedAt: r.assignedAt,
    unassignedAt: r.unassignedAt,
    salesRep: r.repId
      ? { id: r.repId, displayName: r.repDisplayName!, whatsappNumber: r.repWhatsappNumber, active: r.repActive! }
      : null,
  }))
}

export async function assignLeadToRep(
  leadId: string,
  orgId: string,
  salesRepId: string | null,
  assignedById: string,
  reason?: string,
  note?: string,
) {
  // Validate that rep belongs to org and is active (if provided)
  let rep: Awaited<ReturnType<typeof getSalesRep>> | null = null
  if (salesRepId) {
    rep = await getSalesRep(salesRepId, orgId)
    if (!rep) throw new Error("Vendedor no encontrado")
    if (!rep.active) throw new Error("El vendedor está inactivo")
  }

  // Expire current assignment (neon-http: no interactive tx — idempotent ordering)
  await db
    .update(leadAssignments)
    .set({ isCurrent: false, unassignedAt: new Date() })
    .where(
      and(
        eq(leadAssignments.leadId, leadId),
        eq(leadAssignments.orgId, orgId),
        eq(leadAssignments.isCurrent, true),
      )
    )

  // Insert new assignment
  const rows = await db
    .insert(leadAssignments)
    .values({
      leadId,
      orgId,
      salesRepId: salesRepId ?? null,
      assignedById,
      reason: reason ?? null,
      note: note ?? null,
      isCurrent: true,
    })
    .returning()

  // Sync deprecated leads.assigned_to for table display
  await db
    .update(leads)
    .set({ assignedTo: rep ? rep.displayName : null, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
    .catch(() => undefined)

  // Record activity
  await db.insert(leadActivities).values({
    leadId,
    orgId,
    actorId: assignedById,
    actorType: "user",
    activityType: salesRepId ? "assignment_changed" : "assignment_changed",
    metadata: {
      salesRepId: salesRepId ?? null,
      reason: reason ?? null,
    },
  }).catch(() => undefined)

  return rows[0]!
}

export async function unassignLead(
  leadId: string,
  orgId: string,
  unassignedById: string,
  reason?: string,
) {
  await db
    .update(leadAssignments)
    .set({ isCurrent: false, unassignedAt: new Date() })
    .where(
      and(
        eq(leadAssignments.leadId, leadId),
        eq(leadAssignments.orgId, orgId),
        eq(leadAssignments.isCurrent, true),
      )
    )

  await db
    .update(leads)
    .set({ assignedTo: null, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.orgId, orgId)))
    .catch(() => undefined)

  await db.insert(leadActivities).values({
    leadId,
    orgId,
    actorId: unassignedById,
    actorType: "user",
    activityType: "assignment_changed",
    metadata: { salesRepId: null, reason: reason ?? null, action: "unassigned" },
  }).catch(() => undefined)
}

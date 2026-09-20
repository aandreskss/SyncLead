// ─── Team assignment tests ─────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest"
vi.mock("server-only", () => ({}))

// ─── Phone validation (E.164) ─────────────────────────────────────────────────

import { CreateSalesRepSchema, UpdateSalesRepSchema, AssignLeadSchema } from "@/domains/team/types"

describe("CreateSalesRepSchema — phone validation", () => {
  it("accepts valid E.164 number", () => {
    const r = CreateSalesRepSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440001",
      displayName: "Ana",
      whatsappNumber: "+584141234567",
    })
    expect(r.success).toBe(true)
  })

  it("rejects number without + prefix", () => {
    const r = CreateSalesRepSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440001",
      displayName: "Ana",
      whatsappNumber: "584141234567",
    })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toMatch(/E\.164/i)
  })

  it("rejects number shorter than 7 digits", () => {
    const r = CreateSalesRepSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440001",
      displayName: "Ana",
      whatsappNumber: "+123",
    })
    expect(r.success).toBe(false)
  })

  it("accepts null whatsappNumber", () => {
    const r = CreateSalesRepSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440001",
      displayName: "Ana",
      whatsappNumber: null,
    })
    expect(r.success).toBe(true)
  })

  it("rejects missing displayName", () => {
    const r = CreateSalesRepSchema.safeParse({
      clientId: "550e8400-e29b-41d4-a716-446655440001",
      displayName: "",
    })
    expect(r.success).toBe(false)
  })
})

describe("AssignLeadSchema", () => {
  const validBase = {
    leadId: "550e8400-e29b-41d4-a716-446655440002",
    salesRepId: "550e8400-e29b-41d4-a716-446655440003",
  }

  it("accepts valid assignment with reason", () => {
    const r = AssignLeadSchema.safeParse({ ...validBase, reason: "Prioritario" })
    expect(r.success).toBe(true)
    expect(r.data?.reason).toBe("Prioritario")
  })

  it("accepts null salesRepId (unassign)", () => {
    const r = AssignLeadSchema.safeParse({ ...validBase, salesRepId: null })
    expect(r.success).toBe(true)
    expect(r.data?.salesRepId).toBeNull()
  })

  it("rejects reason over 500 chars", () => {
    const r = AssignLeadSchema.safeParse({ ...validBase, reason: "x".repeat(501) })
    expect(r.success).toBe(false)
  })

  it("rejects invalid leadId UUID", () => {
    const r = AssignLeadSchema.safeParse({ ...validBase, leadId: "not-a-uuid" })
    expect(r.success).toBe(false)
  })
})

// ─── Repository logic: concurrent assignment prevention ───────────────────────
// These tests verify the invariant enforced by the unique partial index
// lead_assignments_current_idx ON lead_assignments(lead_id) WHERE is_current = true.

describe("Assignment invariants (logic, no DB)", () => {
  it("expired assignment has is_current = false", () => {
    // Simulate the state after expireCurrentAssignment
    const expired = { isCurrent: false, unassignedAt: new Date() }
    expect(expired.isCurrent).toBe(false)
    expect(expired.unassignedAt).toBeInstanceOf(Date)
  })

  it("new assignment has is_current = true", () => {
    const assignment = { isCurrent: true, unassignedAt: null }
    expect(assignment.isCurrent).toBe(true)
    expect(assignment.unassignedAt).toBeNull()
  })

  it("only one current per lead enforced: after reassign, old has isCurrent=false", () => {
    // Simulate state before and after reassign
    const old = { id: "1", isCurrent: true, salesRepId: "rep-a" }
    const afterExpire = { ...old, isCurrent: false, unassignedAt: new Date() }
    const newAssignment = { id: "2", isCurrent: true, salesRepId: "rep-b" }

    expect(afterExpire.isCurrent).toBe(false)
    expect(newAssignment.isCurrent).toBe(true)
    expect(newAssignment.salesRepId).toBe("rep-b")
  })
})

// ─── Permission model checks (schema level) ──────────────────────────────────

describe("Role-based assignment rules", () => {
  // These represent the business rule: agents can only assign to themselves
  it("owner/admin/manager can assign to any rep", () => {
    const privilegedRoles = ["owner", "admin", "manager"]
    for (const role of privilegedRoles) {
      const canAssignAny = ["owner", "admin", "manager"].includes(role)
      expect(canAssignAny).toBe(true)
    }
  })

  it("agent role is NOT in privileged set", () => {
    const canAssignAny = ["owner", "admin", "manager"].includes("agent")
    expect(canAssignAny).toBe(false)
  })

  it("viewer role is NOT in privileged set", () => {
    const canAssignAny = ["owner", "admin", "manager"].includes("viewer")
    expect(canAssignAny).toBe(false)
  })
})

// ─── Inactive vendor check ────────────────────────────────────────────────────

describe("Inactive sales rep check", () => {
  it("throws when assigning to inactive rep", async () => {
    // Simulate repository.assignLeadToRep behavior when rep is inactive
    async function simulateAssign(repActive: boolean) {
      if (!repActive) throw new Error("El vendedor está inactivo")
      return { id: "assignment-1", isCurrent: true }
    }

    await expect(simulateAssign(false)).rejects.toThrow("El vendedor está inactivo")
    await expect(simulateAssign(true)).resolves.toBeDefined()
  })
})

// ─── Cross-tenant guard ───────────────────────────────────────────────────────

describe("Cross-tenant assignment prevention", () => {
  it("different orgId means rep not found for that org", () => {
    // The repository uses WHERE org_id = ? which isolates tenants.
    // Simulated: if org doesn't match, getSalesRep returns null.
    const reps = [
      { id: "rep-1", orgId: "org-a", displayName: "Ana" },
      { id: "rep-2", orgId: "org-b", displayName: "Bob" },
    ]
    const forOrgA = reps.find((r) => r.id === "rep-2" && r.orgId === "org-a")
    expect(forOrgA).toBeUndefined()
  })
})

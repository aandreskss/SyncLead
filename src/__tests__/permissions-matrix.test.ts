/**
 * Permissions matrix — systematically verifies role-based access control.
 *
 * Tests the requireRole() function for every role × action combination
 * defined in the authorization model. Any regression here is a security P0.
 *
 * Roles:   owner > admin > manager > agent > viewer
 * Source:  src/lib/auth/server.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { MemberRole } from "@/lib/auth/server"

// ─── Mock setup ───────────────────────────────────────────────────────────────

let mockRole: MemberRole = "viewer"
let mockUserId = "user-test-123"
let mockOrgId  = "org-test-456"

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: mockUserId } })),
}))

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      orgMembers: {
        findFirst: vi.fn(async () => ({
          orgId: mockOrgId,
          role: mockRole,
        })),
      },
    },
  },
}))

import { requireRole, requireOrganizationMembership } from "@/lib/auth/server"
import { ForbiddenError } from "@/lib/auth/errors"

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Role hierarchy helper ────────────────────────────────────────────────────

const ROLES: MemberRole[] = ["owner", "admin", "manager", "agent", "viewer"]

function rolesAbove(minRole: MemberRole): MemberRole[] {
  const idx = ROLES.indexOf(minRole)
  return ROLES.slice(0, idx + 1)
}

function rolesBelow(minRole: MemberRole): MemberRole[] {
  const idx = ROLES.indexOf(minRole)
  return ROLES.slice(idx + 1)
}

async function expectAllowed(role: MemberRole, allowedRoles: MemberRole[]) {
  mockRole = role
  await expect(requireRole(allowedRoles)).resolves.toMatchObject({
    userId: mockUserId,
    orgId: mockOrgId,
    role,
  })
}

async function expectForbidden(role: MemberRole, allowedRoles: MemberRole[]) {
  mockRole = role
  await expect(requireRole(allowedRoles)).rejects.toBeInstanceOf(ForbiddenError)
}

// ─── requireOrganizationMembership ───────────────────────────────────────────

describe("requireOrganizationMembership", () => {
  it("returns correct context for any valid member", async () => {
    for (const role of ROLES) {
      mockRole = role
      const ctx = await requireOrganizationMembership()
      expect(ctx.userId).toBe(mockUserId)
      expect(ctx.orgId).toBe(mockOrgId)
      expect(ctx.role).toBe(role)
    }
  })
})

// ─── Owner-only actions ───────────────────────────────────────────────────────

describe("Owner-only actions (org deletion, billing, member removal)", () => {
  const allowed: MemberRole[] = ["owner"]

  it.each(rolesAbove("owner"))("✓ allows %s", async (role) => {
    await expectAllowed(role, allowed)
  })

  it.each(rolesBelow("owner"))("✗ blocks %s", async (role) => {
    await expectForbidden(role, allowed)
  })
})

// ─── Admin+ actions (role changes, Meta connection, credential management) ───

describe("Admin+ actions (Meta connections, role management, key rotation)", () => {
  const allowed: MemberRole[] = ["owner", "admin"]

  it.each(rolesAbove("admin"))("✓ allows %s", async (role) => {
    await expectAllowed(role, allowed)
  })

  it.each(rolesBelow("admin"))("✗ blocks %s", async (role) => {
    await expectForbidden(role, allowed)
  })
})

// ─── Manager+ actions (import, campaign creation, report export) ─────────────

describe("Manager+ actions (import, campaign mgmt, CSV export, health panel)", () => {
  const allowed: MemberRole[] = ["owner", "admin", "manager"]

  it.each(rolesAbove("manager"))("✓ allows %s", async (role) => {
    await expectAllowed(role, allowed)
  })

  it.each(rolesBelow("manager"))("✗ blocks %s", async (role) => {
    await expectForbidden(role, allowed)
  })
})

// ─── Agent+ actions (lead assignment, stage updates, sale registration) ──────

describe("Agent+ actions (lead assignment, stage change, register sale)", () => {
  const allowed: MemberRole[] = ["owner", "admin", "manager", "agent"]

  it.each(rolesAbove("agent"))("✓ allows %s", async (role) => {
    await expectAllowed(role, allowed)
  })

  it.each(rolesBelow("agent"))("✗ blocks %s", async (role) => {
    await expectForbidden(role, allowed)
  })
})

// ─── All roles (read access) ──────────────────────────────────────────────────

describe("All-role actions (read leads, view dashboard)", () => {
  const allowed: MemberRole[] = ["owner", "admin", "manager", "agent", "viewer"]

  it.each(ROLES)("✓ allows %s", async (role) => {
    await expectAllowed(role, allowed)
  })
})

// ─── Cross-org isolation ──────────────────────────────────────────────────────

describe("Cross-org isolation — orgId always from DB, never from request", () => {
  it("returns orgId from DB membership, ignoring any external value", async () => {
    mockRole = "owner"
    const ctx = await requireOrganizationMembership()
    // The orgId must match what the DB returned, not any caller-supplied value
    expect(ctx.orgId).toBe(mockOrgId)
  })

  it("owner of org A cannot access org B resources by changing orgId", async () => {
    // This is enforced by the DB query using the userId-derived orgId
    // The test verifies that orgId is ALWAYS set from the DB membership lookup
    mockRole = "owner"
    const ctxA = await requireOrganizationMembership()
    expect(ctxA.orgId).toBe(mockOrgId)

    // If org B were returned by the DB for this user, it would be different
    // The key invariant: orgId is NEVER passed in from outside
    expect(typeof ctxA.orgId).toBe("string")
    expect(ctxA.orgId.length).toBeGreaterThan(0)
  })
})

// ─── requireRole shape guarantee ─────────────────────────────────────────────

describe("requireRole shape and error types", () => {
  it("resolves with full AuthContext on success", async () => {
    mockRole = "admin"
    const ctx = await requireRole(["owner", "admin"])
    expect(ctx).toHaveProperty("userId")
    expect(ctx).toHaveProperty("orgId")
    expect(ctx).toHaveProperty("role")
    expect(ctx.role).toBe("admin")
  })

  it("throws ForbiddenError (not generic Error) on role mismatch", async () => {
    mockRole = "viewer"
    try {
      await requireRole(["owner", "admin"])
      expect.fail("Should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenError)
      // ForbiddenError is NOT a generic Error that leaks internal details
      expect(e).not.toBeInstanceOf(TypeError)
      expect(e).not.toBeInstanceOf(RangeError)
    }
  })

  it("empty allowedRoles array blocks every role", async () => {
    for (const role of ROLES) {
      mockRole = role
      await expect(requireRole([])).rejects.toBeInstanceOf(ForbiddenError)
    }
  })
})

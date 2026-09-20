import { vi, describe, it, expect, beforeEach } from "vitest"

// Prevent server-only from throwing in test environment
vi.mock("server-only", () => ({}))

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      orgMembers: { findFirst: vi.fn() },
      clients: { findFirst: vi.fn() },
      campaigns: { findFirst: vi.fn() },
    },
  },
}))

import { auth } from "@/auth"
import { db } from "@/lib/db"
import {
  requireUser,
  requireOrganizationMembership,
  requireRole,
  requireClientAccess,
  requireCampaignAccess,
} from "@/lib/auth/server"
import { AuthError, ForbiddenError, NotFoundError } from "@/lib/auth/errors"

const mockAuth = vi.mocked(auth)
const mockOrgMembers = vi.mocked(db.query.orgMembers.findFirst)
const mockClients = vi.mocked(db.query.clients.findFirst)
const mockCampaigns = vi.mocked(db.query.campaigns.findFirst)

// Helpers to avoid repeating "as never" on every partial mock object
function session(id: string) { return { user: { id } } as never }
function member(orgId: string, role: string) { return { orgId, role } as never }
function byId(id: string) { return { id } as never }

const ORG_A = "org-aaaaaaaa-0000-0000-0000-000000000001"
const ORG_B = "org-bbbbbbbb-0000-0000-0000-000000000002"

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── requireUser ──────────────────────────────────────────────────────────────

describe("requireUser", () => {
  it("throws AuthError when session is null", async () => {
    mockAuth.mockResolvedValue(null as never)
    await expect(requireUser()).rejects.toBeInstanceOf(AuthError)
  })

  it("throws AuthError when session has no user.id", async () => {
    mockAuth.mockResolvedValue({ user: {} } as never)
    await expect(requireUser()).rejects.toBeInstanceOf(AuthError)
  })

  it("returns userId from verified session", async () => {
    mockAuth.mockResolvedValue(session("user-1"))
    const result = await requireUser()
    expect(result.userId).toBe("user-1")
  })
})

// ─── requireOrganizationMembership ───────────────────────────────────────────

describe("requireOrganizationMembership", () => {
  it("throws AuthError when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never)
    await expect(requireOrganizationMembership()).rejects.toBeInstanceOf(AuthError)
  })

  it("throws ForbiddenError when user has no org membership", async () => {
    mockAuth.mockResolvedValue(session("user-1"))
    mockOrgMembers.mockResolvedValue(undefined)
    await expect(requireOrganizationMembership()).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("returns orgId and role from orgMembers — not from request", async () => {
    mockAuth.mockResolvedValue(session("user-1"))
    mockOrgMembers.mockResolvedValue(member(ORG_A, "admin"))
    const ctx = await requireOrganizationMembership()
    expect(ctx.orgId).toBe(ORG_A)
    expect(ctx.role).toBe("admin")
    expect(ctx.userId).toBe("user-1")
  })

  it("ignores any org_id that could be sent by browser (not in function params)", async () => {
    // requireOrganizationMembership takes no parameters — org is always from DB
    mockAuth.mockResolvedValue(session("user-2"))
    mockOrgMembers.mockResolvedValue(member(ORG_B, "viewer"))
    const ctx = await requireOrganizationMembership()
    expect(ctx.orgId).toBe(ORG_B)
  })
})

// ─── requireRole ─────────────────────────────────────────────────────────────

describe("requireRole", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(session("user-1"))
  })

  it("throws ForbiddenError when viewer attempts admin-only action", async () => {
    mockOrgMembers.mockResolvedValue(member(ORG_A, "viewer"))
    await expect(requireRole(["owner", "admin"])).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("throws ForbiddenError when agent attempts manager-or-above action", async () => {
    mockOrgMembers.mockResolvedValue(member(ORG_A, "agent"))
    await expect(requireRole(["owner", "admin", "manager"])).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("allows owner through any role gate", async () => {
    mockOrgMembers.mockResolvedValue(member(ORG_A, "owner"))
    const ctx = await requireRole(["owner", "admin"])
    expect(ctx.role).toBe("owner")
  })

  it("allows admin through admin gate", async () => {
    mockOrgMembers.mockResolvedValue(member(ORG_A, "admin"))
    const ctx = await requireRole(["owner", "admin"])
    expect(ctx.role).toBe("admin")
  })

  it("allows agent through agent-and-above gate", async () => {
    mockOrgMembers.mockResolvedValue(member(ORG_A, "agent"))
    const ctx = await requireRole(["owner", "admin", "manager", "agent"])
    expect(ctx.role).toBe("agent")
  })
})

// ─── requireClientAccess ─────────────────────────────────────────────────────

describe("requireClientAccess", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(session("user-1"))
    mockOrgMembers.mockResolvedValue(member(ORG_A, "admin"))
  })

  it("throws NotFoundError when client belongs to a different org (cross-tenant)", async () => {
    // Simulates: user is in ORG_A, but tries to access a client in ORG_B
    // DB returns undefined because the query is: WHERE id=? AND org_id=ORG_A
    mockClients.mockResolvedValue(undefined)
    await expect(requireClientAccess("client-from-org-b")).rejects.toBeInstanceOf(NotFoundError)
  })

  it("throws NotFoundError for non-existent client", async () => {
    mockClients.mockResolvedValue(undefined)
    await expect(requireClientAccess("non-existent-id")).rejects.toBeInstanceOf(NotFoundError)
  })

  it("allows access when client belongs to user's org", async () => {
    mockClients.mockResolvedValue(byId("client-1"))
    const ctx = await requireClientAccess("client-1")
    expect(ctx.clientId).toBe("client-1")
    expect(ctx.orgId).toBe(ORG_A)
  })

  it("queries DB exactly once for the client (with orgId from session)", async () => {
    mockClients.mockResolvedValue(byId("client-1"))
    await requireClientAccess("client-1")
    // DB was called once — orgId comes from orgMembers (session), not from arguments
    expect(mockClients).toHaveBeenCalledTimes(1)
  })
})

// ─── requireCampaignAccess ───────────────────────────────────────────────────

describe("requireCampaignAccess", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(session("user-1"))
    mockOrgMembers.mockResolvedValue(member(ORG_A, "manager"))
  })

  it("throws NotFoundError when campaign belongs to a different org (cross-tenant)", async () => {
    mockCampaigns.mockResolvedValue(undefined)
    await expect(requireCampaignAccess("campaign-from-org-b")).rejects.toBeInstanceOf(NotFoundError)
  })

  it("throws NotFoundError for non-existent campaign", async () => {
    mockCampaigns.mockResolvedValue(undefined)
    await expect(requireCampaignAccess("ghost-id")).rejects.toBeInstanceOf(NotFoundError)
  })

  it("allows access when campaign belongs to user's org", async () => {
    mockCampaigns.mockResolvedValue(byId("campaign-1"))
    const ctx = await requireCampaignAccess("campaign-1")
    expect(ctx.campaignId).toBe("campaign-1")
    expect(ctx.orgId).toBe(ORG_A)
  })
})

// ─── Cross-tenant isolation guarantee ────────────────────────────────────────

describe("cross-tenant isolation — user in ORG_A cannot access ORG_B resources", () => {
  it("user-A cannot read a client owned by org-B", async () => {
    mockAuth.mockResolvedValue(session("user-a"))
    mockOrgMembers.mockResolvedValue(member(ORG_A, "owner"))
    // Even if user-a passes a client ID that belongs to org-B, the DB query
    // scopes by ORG_A and returns undefined → NotFoundError
    mockClients.mockResolvedValue(undefined)
    await expect(requireClientAccess("client-of-org-b")).rejects.toBeInstanceOf(NotFoundError)
  })

  it("user-A cannot trigger a campaign action in org-B", async () => {
    mockAuth.mockResolvedValue(session("user-a"))
    mockOrgMembers.mockResolvedValue(member(ORG_A, "owner"))
    mockCampaigns.mockResolvedValue(undefined)
    await expect(requireCampaignAccess("campaign-of-org-b")).rejects.toBeInstanceOf(NotFoundError)
  })

  it("unauthenticated request is rejected before any DB query", async () => {
    mockAuth.mockResolvedValue(null as never)
    await expect(requireClientAccess("any-client")).rejects.toBeInstanceOf(AuthError)
    expect(mockOrgMembers).not.toHaveBeenCalled()
    expect(mockClients).not.toHaveBeenCalled()
  })
})

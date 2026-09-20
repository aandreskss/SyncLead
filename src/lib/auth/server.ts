import "server-only"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { orgMembers, clients, campaigns } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { AuthError, ForbiddenError, NotFoundError } from "./errors"

export type MemberRole = "owner" | "admin" | "manager" | "agent" | "viewer"

export interface AuthContext {
  userId: string
  orgId: string
  role: MemberRole
}

/**
 * Requires a valid session. Throws AuthError if the user is not logged in.
 * userId is derived from the verified JWT — never from the request body.
 */
export async function requireUser(): Promise<{ userId: string }> {
  const session = await auth()
  if (!session?.user?.id) throw new AuthError()
  return { userId: session.user.id }
}

/**
 * Requires the user to be a member of at least one organization.
 * Resolves orgId and role from the orgMembers table — never from the browser.
 * Returns the first membership found (org switcher is a future feature).
 */
export async function requireOrganizationMembership(): Promise<AuthContext> {
  const { userId } = await requireUser()
  const member = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.userId, userId),
    columns: { orgId: true, role: true },
  })
  if (!member) throw new ForbiddenError("Sin membresía en la organización")
  return { userId, orgId: member.orgId, role: member.role as MemberRole }
}

/**
 * Requires membership AND that the user's role is in allowedRoles.
 * Use this for actions restricted to specific roles (e.g. only owner/admin can delete).
 */
export async function requireRole(allowedRoles: MemberRole[]): Promise<AuthContext> {
  const ctx = await requireOrganizationMembership()
  if (!allowedRoles.includes(ctx.role)) throw new ForbiddenError("Permisos insuficientes")
  return ctx
}

/**
 * Requires membership AND that the given clientId belongs to the user's org.
 * Prevents cross-tenant access to clients from another org.
 */
export async function requireClientAccess(
  clientId: string
): Promise<AuthContext & { clientId: string }> {
  const ctx = await requireOrganizationMembership()
  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, clientId), eq(clients.orgId, ctx.orgId)),
    columns: { id: true },
  })
  if (!client) throw new NotFoundError("Cliente no encontrado")
  return { ...ctx, clientId }
}

/**
 * Requires membership AND that the given campaignId belongs to the user's org.
 * Prevents cross-tenant access to campaigns from another org.
 */
export async function requireCampaignAccess(
  campaignId: string
): Promise<AuthContext & { campaignId: string }> {
  const ctx = await requireOrganizationMembership()
  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, campaignId), eq(campaigns.orgId, ctx.orgId)),
    columns: { id: true },
  })
  if (!campaign) throw new NotFoundError("Campaña no encontrada")
  return { ...ctx, campaignId }
}

import "server-only"
import { db } from "@/lib/db"
import { organizations, orgMembers, leads, campaigns, users, accounts } from "@/lib/db/schema"
import { sql, eq, ilike } from "drizzle-orm"

export async function getAllOrgsWithStats() {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      plan: organizations.plan,
      suspended: organizations.suspended,
      features: organizations.features,
      createdAt: organizations.createdAt,
      memberCount: sql<number>`cast(count(distinct ${orgMembers.userId}) as int)`,
    })
    .from(organizations)
    .leftJoin(orgMembers, eq(orgMembers.orgId, organizations.id))
    .groupBy(organizations.id)
    .orderBy(organizations.createdAt)
}

export async function getOrgForAdmin(orgId: string) {
  return db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  })
}

export async function getOrgMembersForAdmin(orgId: string) {
  return db
    .select({
      userId: orgMembers.userId,
      role: orgMembers.role,
      email: users.email,
      name: users.name,
      createdAt: orgMembers.createdAt,
    })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(eq(orgMembers.orgId, orgId))
    .orderBy(orgMembers.createdAt)
}

export async function searchUsersByEmail(email: string) {
  if (!email.trim()) return []
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      password: users.password,
    })
    .from(users)
    .where(ilike(users.email, `%${email.trim()}%`))
    .limit(20)
  return rows.map(({ password, ...u }) => ({ ...u, hasPassword: password !== null }))
}

export async function getUserWithDetailsForAdmin(userId: string) {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      password: users.password,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!row) return null
  const { password, ...user } = row
  const hasPassword = password !== null

  const linkedAccounts = await db
    .select({ provider: accounts.provider, providerAccountId: accounts.providerAccountId })
    .from(accounts)
    .where(eq(accounts.userId, userId))

  const memberships = await db
    .select({
      orgId: orgMembers.orgId,
      role: orgMembers.role,
      orgName: organizations.name,
      orgPlan: organizations.plan,
      orgSuspended: organizations.suspended,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
    .where(eq(orgMembers.userId, userId))

  return { ...user, hasPassword, linkedAccounts, memberships }
}

export async function getOrgStatsForAdmin(orgId: string) {
  const [campRow] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(campaigns)
    .where(eq(campaigns.orgId, orgId))

  const [leadRow] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(leads)
    .where(eq(leads.orgId, orgId))

  return { campaigns: campRow?.count ?? 0, leads: leadRow?.count ?? 0 }
}

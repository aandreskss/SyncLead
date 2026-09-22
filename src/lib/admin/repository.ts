import "server-only"
import { db } from "@/lib/db"
import { organizations, orgMembers, leads, campaigns } from "@/lib/db/schema"
import { sql, eq } from "drizzle-orm"

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
  const { users } = await import("@/lib/db/schema")
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

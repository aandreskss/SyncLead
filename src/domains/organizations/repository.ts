import { db } from "@/lib/db"
import { organizations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { NewOrganization, Organization } from "@/lib/db/schema"

export async function getOrganizationById(orgId: string): Promise<Organization | undefined> {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)
  return rows[0]
}

// Used only during onboarding, before orgMembers is populated.
export async function getOrganizationByOwnerId(ownerId: string): Promise<Organization | undefined> {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.ownerId, ownerId))
    .limit(1)
  return rows[0]
}

export async function createOrganization(data: NewOrganization): Promise<Organization> {
  const [org] = await db.insert(organizations).values(data).returning()
  return org
}

export async function markOnboardingComplete(orgId: string): Promise<void> {
  await db
    .update(organizations)
    .set({ onboardingCompleted: true, updatedAt: new Date() })
    .where(eq(organizations.id, orgId))
}

export async function slugExists(slug: string): Promise<boolean> {
  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.slug, slug),
  })
  return !!existing
}

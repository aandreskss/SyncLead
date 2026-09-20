import { db } from "@/lib/db"
import { organizations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { NewOrganization, Organization } from "@/lib/db/schema"

export async function getOrganizationById(orgId: string): Promise<Organization | undefined> {
  return db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  })
}

// Used only during onboarding, before orgMembers is populated.
export async function getOrganizationByOwnerId(ownerId: string): Promise<Organization | undefined> {
  return db.query.organizations.findFirst({
    where: eq(organizations.ownerId, ownerId),
  })
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

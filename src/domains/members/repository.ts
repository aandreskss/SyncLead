import { db } from "@/lib/db"
import { orgMembers, users } from "@/lib/db/schema"
import { and, eq, ne } from "drizzle-orm"
import type { MemberRole } from "@/lib/db/schema"

export type MemberWithUser = {
  id: string
  orgId: string
  userId: string
  role: MemberRole
  createdAt: Date
  user: {
    id: string
    name: string | null
    email: string | null
  }
}

export async function listMembers(orgId: string): Promise<MemberWithUser[]> {
  return db.query.orgMembers.findMany({
    where: eq(orgMembers.orgId, orgId),
    with: {
      user: { columns: { id: true, name: true, email: true } },
    },
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  }) as Promise<MemberWithUser[]>
}

export async function findUserByEmail(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true, name: true, email: true },
  })
}

export async function getMembershipByUserId(orgId: string, userId: string) {
  return db.query.orgMembers.findFirst({
    where: and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)),
    columns: { id: true, role: true },
  })
}

export async function getMemberById(orgId: string, memberId: string) {
  return db.query.orgMembers.findFirst({
    where: and(eq(orgMembers.id, memberId), eq(orgMembers.orgId, orgId)),
    columns: { id: true, orgId: true, userId: true, role: true },
  })
}

export async function insertMember(orgId: string, userId: string, role: MemberRole) {
  const [member] = await db
    .insert(orgMembers)
    .values({ orgId, userId, role })
    .returning()
  return member
}

export async function setMemberRole(orgId: string, memberId: string, role: MemberRole) {
  await db
    .update(orgMembers)
    .set({ role })
    .where(
      and(
        eq(orgMembers.id, memberId),
        eq(orgMembers.orgId, orgId),
        ne(orgMembers.role, "owner")
      )
    )
}

export async function deleteMember(orgId: string, memberId: string) {
  await db
    .delete(orgMembers)
    .where(
      and(
        eq(orgMembers.id, memberId),
        eq(orgMembers.orgId, orgId),
        ne(orgMembers.role, "owner")
      )
    )
}

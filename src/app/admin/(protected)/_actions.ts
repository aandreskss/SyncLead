"use server"

import { db } from "@/lib/db"
import { organizations, users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requireAdminAuth } from "@/lib/admin/auth"
import { revalidatePath } from "next/cache"
import { PLAN_OPTIONS } from "@/lib/admin/definitions"
import { hash } from "bcryptjs"
import { setPlatformConfig } from "@/lib/admin/platform-config"

type Result = { error?: string }

export async function updateOrgPlanAction(orgId: string, plan: string): Promise<Result> {
  try { await requireAdminAuth() } catch { return { error: "No autorizado" } }
  if (!(PLAN_OPTIONS as readonly string[]).includes(plan)) return { error: "Plan inválido" }
  await db.update(organizations).set({ plan }).where(eq(organizations.id, orgId))
  revalidatePath("/admin")
  revalidatePath(`/admin/orgs/${orgId}`)
  return {}
}

export async function toggleOrgSuspendedAction(orgId: string, suspended: boolean): Promise<Result> {
  try { await requireAdminAuth() } catch { return { error: "No autorizado" } }
  await db.update(organizations).set({ suspended }).where(eq(organizations.id, orgId))
  revalidatePath("/admin")
  revalidatePath(`/admin/orgs/${orgId}`)
  return {}
}

export async function updateOrgFeaturesAction(
  orgId: string,
  features: Record<string, boolean>,
): Promise<Result> {
  try { await requireAdminAuth() } catch { return { error: "No autorizado" } }
  await db.update(organizations).set({ features }).where(eq(organizations.id, orgId))
  revalidatePath(`/admin/orgs/${orgId}`)
  return {}
}

export async function updatePlatformConfigAction(
  key: string,
  value: unknown,
): Promise<Result> {
  try { await requireAdminAuth() } catch { return { error: "No autorizado" } }
  await setPlatformConfig(key, value)
  revalidatePath("/admin/platform")
  return {}
}

export async function setUserPasswordAction(
  userId: string,
  newPassword: string,
): Promise<Result> {
  try { await requireAdminAuth() } catch { return { error: "No autorizado" } }
  if (!newPassword || newPassword.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres" }
  const hashed = await hash(newPassword, 12)
  await db.update(users).set({ password: hashed }).where(eq(users.id, userId))
  revalidatePath("/admin/users")
  return {}
}

export async function deleteUserAction(userId: string): Promise<Result> {
  try { await requireAdminAuth() } catch { return { error: "No autorizado" } }
  // Cascades: accounts, org_members, organizations (and all their data via cascade)
  await db.delete(users).where(eq(users.id, userId))
  revalidatePath("/admin/users")
  revalidatePath("/admin")
  return {}
}

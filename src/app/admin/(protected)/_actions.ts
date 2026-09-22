"use server"

import { db } from "@/lib/db"
import { organizations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requireAdminAuth } from "@/lib/admin/auth"
import { revalidatePath } from "next/cache"
import { PLAN_OPTIONS } from "@/lib/admin/definitions"

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

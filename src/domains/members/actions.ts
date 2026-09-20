"use server"

import { randomBytes } from "crypto"
import { hash } from "bcryptjs"
import { requireRole, requireOrganizationMembership } from "@/lib/auth/server"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import type { MemberRole } from "@/lib/db/schema"
import {
  listMembers,
  findUserByEmail,
  getMembershipByUserId,
  getMemberById,
  insertMember,
  setMemberRole,
  deleteMember,
} from "./repository"
import type { MemberWithUser } from "./repository"

export type { MemberWithUser }

export type AddMemberState = {
  error?: string
  tempPassword?: string
  email?: string
}

const ASSIGNABLE_BY_OWNER: MemberRole[] = ["admin", "manager", "agent", "viewer"]
const ASSIGNABLE_BY_ADMIN: MemberRole[] = ["manager", "agent", "viewer"]

export async function listMembersAction(): Promise<MemberWithUser[]> {
  const ctx = await requireOrganizationMembership()
  return listMembers(ctx.orgId)
}

export async function addMemberAction(
  _prev: AddMemberState | undefined,
  formData: FormData
): Promise<AddMemberState> {
  const ctx = await requireRole(["owner", "admin"])

  const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? ""
  const role = (formData.get("role") as string | null) ?? ""

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Email inválido." }
  }

  const allowed = ctx.role === "owner" ? ASSIGNABLE_BY_OWNER : ASSIGNABLE_BY_ADMIN
  if (!allowed.includes(role as MemberRole)) {
    return { error: "Rol no permitido." }
  }

  let user = await findUserByEmail(email)
  let tempPassword: string | undefined

  if (!user) {
    const providedPassword = (formData.get("password") as string | null)?.trim() ?? ""
    if (providedPassword.length > 0 && providedPassword.length < 8) {
      return { error: "La contraseña debe tener al menos 8 caracteres." }
    }
    tempPassword = providedPassword.length >= 8 ? providedPassword : randomBytes(8).toString("hex")
    const passwordHash = await hash(tempPassword, 12)
    const [created] = await db
      .insert(users)
      .values({
        email,
        name: email.split("@")[0],
        emailVerified: new Date(),
        password: passwordHash,
      })
      .returning({ id: users.id, name: users.name, email: users.email })
    user = created
  }

  const existing = await getMembershipByUserId(ctx.orgId, user.id)
  if (existing) {
    return { error: "Este usuario ya es miembro de la organización." }
  }

  await insertMember(ctx.orgId, user.id, role as MemberRole)

  return { email, tempPassword }
}

export async function updateMemberRoleAction(
  memberId: string,
  role: MemberRole
): Promise<{ error?: string }> {
  const ctx = await requireRole(["owner", "admin"])

  const member = await getMemberById(ctx.orgId, memberId)
  if (!member) return { error: "Miembro no encontrado." }
  if (member.role === "owner") return { error: "No se puede modificar el rol del owner." }
  if (member.userId === ctx.userId) return { error: "No puedes cambiar tu propio rol." }

  if (ctx.role === "admin") {
    if (role === "admin" || role === "owner") {
      return { error: "Los administradores no pueden asignar este rol." }
    }
    if (member.role === "admin") {
      return { error: "Los administradores no pueden modificar a otros administradores." }
    }
  }

  const allowed = ctx.role === "owner" ? ASSIGNABLE_BY_OWNER : ASSIGNABLE_BY_ADMIN
  if (!allowed.includes(role)) return { error: "Rol no permitido." }

  await setMemberRole(ctx.orgId, memberId, role)
  return {}
}

export async function removeMemberAction(
  memberId: string
): Promise<{ error?: string }> {
  const ctx = await requireRole(["owner", "admin"])

  const member = await getMemberById(ctx.orgId, memberId)
  if (!member) return { error: "Miembro no encontrado." }
  if (member.role === "owner") return { error: "No se puede eliminar al owner." }
  if (member.userId === ctx.userId) return { error: "No puedes eliminarte a ti mismo." }

  if (ctx.role === "admin" && member.role === "admin") {
    return { error: "Los administradores no pueden eliminar a otros administradores." }
  }

  await deleteMember(ctx.orgId, memberId)
  return {}
}

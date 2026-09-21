"use server"

import { compare, hash } from "bcryptjs"
import { eq } from "drizzle-orm"
import { requireUser } from "@/lib/auth/server"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"

export interface MyProfile {
  id: string
  name: string | null
  email: string | null
  image: string | null
  hasPassword: boolean
}

export async function getMyProfileAction(): Promise<MyProfile | null> {
  const { userId } = await requireUser()
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, name: true, email: true, image: true, password: true },
  })
  if (!user) return null
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    hasPassword: !!user.password,
  }
}

export async function updateDisplayNameAction(
  name: string
): Promise<{ success?: true; error?: string }> {
  const { userId } = await requireUser()
  const trimmed = name.trim()
  if (!trimmed) return { error: "El nombre no puede estar vacío" }
  if (trimmed.length > 100) return { error: "El nombre no puede exceder 100 caracteres" }
  await db.update(users).set({ name: trimmed }).where(eq(users.id, userId))
  return { success: true }
}

export async function updateAvatarUrlAction(
  imageUrl: string
): Promise<{ success?: true; error?: string }> {
  const { userId } = await requireUser()
  const trimmed = imageUrl.trim()
  if (trimmed) {
    try {
      const url = new URL(trimmed)
      if (!["http:", "https:"].includes(url.protocol)) {
        return { error: "Solo se permiten URLs http/https" }
      }
    } catch {
      return { error: "URL de imagen inválida" }
    }
  }
  await db.update(users).set({ image: trimmed || null }).where(eq(users.id, userId))
  return { success: true }
}

export async function updateEmailAction(
  email: string,
  currentPassword: string
): Promise<{ success?: true; error?: string }> {
  const { userId } = await requireUser()
  const trimmed = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { error: "Email inválido" }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { password: true, email: true },
  })
  if (!user) return { error: "Usuario no encontrado" }
  if (!user.password) {
    return { error: "Esta cuenta usa Google — el email no se puede cambiar aquí" }
  }
  if (trimmed === user.email) return { error: "El nuevo email es igual al actual" }

  const valid = await compare(currentPassword, user.password)
  if (!valid) return { error: "La contraseña actual es incorrecta" }

  const existing = await db.query.users.findFirst({
    where: eq(users.email, trimmed),
    columns: { id: true },
  })
  if (existing && existing.id !== userId) {
    return { error: "Este email ya está registrado en otra cuenta" }
  }

  await db
    .update(users)
    .set({ email: trimmed, emailVerified: new Date() })
    .where(eq(users.id, userId))
  return { success: true }
}

export async function updatePasswordAction(
  currentPassword: string,
  newPassword: string
): Promise<{ success?: true; error?: string }> {
  const { userId } = await requireUser()

  if (!newPassword || newPassword.length < 8) {
    return { error: "La nueva contraseña debe tener al menos 8 caracteres" }
  }
  if (currentPassword === newPassword) {
    return { error: "La nueva contraseña debe ser diferente a la actual" }
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { password: true },
  })
  if (!user) return { error: "Usuario no encontrado" }
  if (!user.password) {
    return { error: "Esta cuenta usa Google — no se puede cambiar la contraseña aquí" }
  }

  const valid = await compare(currentPassword, user.password)
  if (!valid) return { error: "La contraseña actual es incorrecta" }

  const passwordHash = await hash(newPassword, 12)
  await db.update(users).set({ password: passwordHash }).where(eq(users.id, userId))
  return { success: true }
}

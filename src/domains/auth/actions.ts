"use server"

import { db } from "@/lib/db"
import { users, orgMembers } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { hash } from "bcryptjs"
import { signIn } from "@/auth"
import { AuthError } from "next-auth"
import { Ratelimit } from "@upstash/ratelimit"
import { getRedis } from "@/lib/redis"
import { headers } from "next/headers"
import { provisionOrganization } from "@/domains/organizations/service"
import { markOnboardingComplete } from "@/domains/organizations/repository"

const redis = getRedis()
const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      prefix: "ratelimit:auth-actions",
    })
  : null

async function checkRateLimit(): Promise<boolean> {
  if (!ratelimit) return true
  const headersList = await headers()
  const ip = headersList.get("x-forwarded-for")?.split(",")[0] ?? "anonymous"
  const { success } = await ratelimit.limit(ip)
  return success
}

// signIn() de Auth.js v5 lanza un error especial para activar el redirect.
// Debe ser re-lanzado o el navegador no redirige.
function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  )
}

export async function loginAction(
  _prevState: { error: string } | undefined,
  formData: FormData
) {
  const allowed = await checkRateLimit()
  if (!allowed) return { error: "Demasiados intentos. Espera un momento." }

  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) return { error: "Email y contraseña son requeridos." }

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" })
  } catch (error) {
    if (isRedirectError(error)) throw error
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return { error: "Email o contraseña incorrectos." }
      }
      return { error: "Error al iniciar sesión. Intenta de nuevo." }
    }
    console.error("[loginAction]", error instanceof Error ? error.message : String(error))
    return { error: "Error de servidor. Intenta de nuevo." }
  }
}

export async function registerAction(
  _prevState: { error: string } | undefined,
  formData: FormData
) {
  const allowed = await checkRateLimit()
  if (!allowed) return { error: "Demasiados intentos. Espera un momento." }

  const name = (formData.get("name") as string)?.trim()
  const email = (formData.get("email") as string)?.trim().toLowerCase()
  const password = formData.get("password") as string

  if (!name || !email || !password) return { error: "Todos los campos son requeridos." }
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email inválido." }

  try {
    const existing = await db.query.users.findFirst({ where: eq(users.email, email) })
    if (existing) return { error: "Ya existe una cuenta con ese email." }

    const hashedPassword = await hash(password, 12)
    const userId = crypto.randomUUID()

    await db.insert(users).values({
      id: userId,
      name,
      email,
      password: hashedPassword,
    })

    const org = await provisionOrganization(userId, name)
    await db.insert(orgMembers).values({ orgId: org.id, userId, role: "owner" })
    await markOnboardingComplete(org.id)
  } catch (error) {
    console.error("[registerAction:db]", error instanceof Error ? error.message : String(error))
    return { error: "Error al crear la cuenta. Verifica tu conexión e intenta de nuevo." }
  }

  // Separado del bloque anterior: signIn lanza NEXT_REDIRECT que debe propagarse
  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" })
  } catch (error) {
    if (isRedirectError(error)) throw error
    if (error instanceof AuthError) {
      return { error: "Cuenta creada. Inicia sesión manualmente." }
    }
    console.error("[registerAction:signIn]", error instanceof Error ? error.message : String(error))
    return { error: "Cuenta creada, pero falló el inicio de sesión automático. Inicia sesión." }
  }
}

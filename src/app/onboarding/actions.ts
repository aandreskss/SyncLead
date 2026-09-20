"use server"

import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { provisionOrganization } from "@/domains/organizations/service"
import { getOrganizationByOwnerId, markOnboardingComplete } from "@/domains/organizations/repository"
import { db } from "@/lib/db"
import { clients } from "@/lib/db/schema"
import { encryptToken } from "@/lib/crypto"
import { randomBytes } from "crypto"

export async function createOrgAction(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const name = (formData.get("orgName") as string)?.trim()
  if (!name || name.length < 2) return { error: "El nombre debe tener al menos 2 caracteres." }
  if (name.length > 60) return { error: "El nombre es demasiado largo." }

  const existing = await getOrganizationByOwnerId(session.user.id)
  if (existing) return { orgId: existing.id }

  const org = await provisionOrganization(session.user.id, name)
  return { orgId: org.id }
}

export async function createFirstClientAction(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const org = await getOrganizationByOwnerId(session.user.id)
  if (!org) return { error: "No se encontró tu organización. Vuelve al paso 1." }

  const clientName = (formData.get("clientName") as string)?.trim()
  const pixelId = (formData.get("pixelId") as string)?.trim()
  const accessToken = (formData.get("accessToken") as string)?.trim()
  const numbersRaw = (formData.get("whatsappNumbers") as string) ?? ""

  if (!clientName) return { error: "El nombre del cliente es requerido." }

  const whatsappNumbers = numbersRaw
    .split("\n")
    .map((n) => n.replace(/[\s\-\(\)\+]/g, "").trim())
    .filter((n) => n.length >= 8)

  const encryptedToken = accessToken ? encryptToken(accessToken) : null

  await db.insert(clients).values({
    orgId: org.id,
    name: clientName,
    metaPixelId: pixelId || null,
    metaAccessTokenEnc: encryptedToken,
    whatsappNumbers,
  })

  await markOnboardingComplete(org.id)

  return { success: true }
}

export async function skipClientAction() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const org = await getOrganizationByOwnerId(session.user.id)
  if (org) await markOnboardingComplete(org.id)

  redirect("/dashboard")
}

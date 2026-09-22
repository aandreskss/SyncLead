"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { makeAdminToken, verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin/auth"

export async function adminLoginAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const password = (formData.get("password") as string) ?? ""
  const secret = process.env.ADMIN_SECRET

  if (!secret || !password || password !== secret) {
    return { error: "Contraseña incorrecta" }
  }

  const token = makeAdminToken()
  const jar = await cookies()
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60,
    path: "/",
  })
  redirect("/admin")
}

export async function adminLogoutAction(): Promise<void> {
  const jar = await cookies()
  jar.delete(ADMIN_COOKIE)
  redirect("/admin/login")
}

export async function checkAdminSession(): Promise<boolean> {
  const jar = await cookies()
  return verifyAdminToken(jar.get(ADMIN_COOKIE)?.value)
}

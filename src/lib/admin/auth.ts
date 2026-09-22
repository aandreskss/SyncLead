import "server-only"
import { createHmac, timingSafeEqual } from "crypto"
import { cookies } from "next/headers"

export const ADMIN_COOKIE = "sl_admin_v1"
const TTL_MS = 8 * 60 * 60 * 1000 // 8 hours

function sign(payload: string): string {
  const secret = process.env.ADMIN_SECRET ?? "__no_secret__"
  return createHmac("sha256", secret).update(payload).digest("hex")
}

export function makeAdminToken(): string {
  const ts = Date.now().toString()
  return `${ts}.${sign(ts)}`
}

export function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false
  try {
    const dot = token.lastIndexOf(".")
    if (dot < 0) return false
    const ts = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const expected = sign(ts)
    const sigBuf = Buffer.from(sig, "hex")
    const expBuf = Buffer.from(expected, "hex")
    if (sigBuf.length !== expBuf.length) return false
    if (!timingSafeEqual(sigBuf, expBuf)) return false
    const age = Date.now() - parseInt(ts)
    return age >= 0 && age <= TTL_MS
  } catch {
    return false
  }
}

export async function requireAdminAuth(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(ADMIN_COOKIE)?.value
  if (!verifyAdminToken(token)) {
    throw new Error("ADMIN_UNAUTHORIZED")
  }
}

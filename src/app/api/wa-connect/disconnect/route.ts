import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { unsubscribeWabaFromApp } from "@/domains/meta-wa-connect/webhook-subscription"
import { getWabaWithToken, markWabaDisconnected } from "@/domains/meta-wa-connect/repository"
import { decryptTokenVersioned } from "@/lib/crypto"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireRole>>
  try {
    ctx = await requireRole(["owner", "admin"])
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    throw e
  }

  let wabaId: string
  try {
    const body = await request.json() as { wabaId?: string }
    if (!body.wabaId || typeof body.wabaId !== "string") {
      return NextResponse.json({ error: "wabaId required" }, { status: 400 })
    }
    wabaId = body.wabaId
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  // Verify ownership
  const waba = await getWabaWithToken(wabaId, ctx.orgId)
  if (!waba) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Attempt to unsubscribe from Meta (best-effort)
  if (waba.accessTokenEnc) {
    try {
      const token = decryptTokenVersioned(waba.accessTokenEnc)
      await unsubscribeWabaFromApp(wabaId, token)
    } catch {
      // Non-fatal: proceed with DB disconnect even if Meta call fails
    }
  }

  await markWabaDisconnected(wabaId, ctx.orgId)

  return NextResponse.json({ ok: true })
}

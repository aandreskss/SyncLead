import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { buildOAuthUrl } from "@/domains/meta-wa-connect/oauth"
import { createOauthState } from "@/domains/meta-wa-connect/repository"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireRole>>
  try {
    ctx = await requireRole(["owner", "admin"])
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) {
      return NextResponse.redirect(new URL("/auth/login", request.url))
    }
    throw e
  }

  if (!process.env.META_WA_APP_ID) {
    return NextResponse.redirect(
      new URL("/dashboard/settings/channels?wa_error=app_not_configured", request.url)
    )
  }

  const returnPath = new URL(request.url).searchParams.get("return") ?? "/dashboard/settings/channels"

  const stateId = await createOauthState(ctx.orgId, returnPath)
  const oauthUrl = buildOAuthUrl(stateId)

  return NextResponse.redirect(oauthUrl)
}

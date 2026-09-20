import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { leads } from "@/lib/db/schema"
import { and, isNotNull, isNull, lt } from "drizzle-orm"
import { withJobRun } from "@/lib/jobs/runner"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const run = await withJobRun("retention-cleanup", async () => {
    const now = new Date()

    const ipResult = await db
      .update(leads)
      .set({ ip: null, ipExpiresAt: null, updatedAt: now })
      .where(and(isNotNull(leads.ip), isNotNull(leads.ipExpiresAt), lt(leads.ipExpiresAt, now)))
    const ipNullified = ipResult.rowCount ?? 0

    const uaResult = await db
      .update(leads)
      .set({ userAgent: null, uaExpiresAt: null, updatedAt: now })
      .where(and(isNotNull(leads.userAgent), isNotNull(leads.uaExpiresAt), lt(leads.uaExpiresAt, now)))
    const uaNullified = uaResult.rowCount ?? 0

    const eraseResult = await db
      .update(leads)
      .set({
        name: "[erased]",
        email: null,
        phone: null,
        city: null,
        ip: null,
        ipExpiresAt: null,
        userAgent: null,
        uaExpiresAt: null,
        fbc: null,
        fbp: null,
        fbclid: null,
        erasedAt: now,
        updatedAt: now,
      })
      .where(and(isNotNull(leads.deletionRequestedAt), isNull(leads.erasedAt)))
    const erased = eraseResult.rowCount ?? 0

    return {
      itemsProcessed: ipNullified + uaNullified + erased,
      result: { ipNullified, uaNullified, erased },
    }
  })

  return NextResponse.json({ ok: run.ok, correlationId: run.correlationId, durationMs: run.durationMs })
}

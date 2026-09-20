import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { webhookEvents } from "@/lib/db/schema"
import { lt } from "drizzle-orm"
import { withJobRun } from "@/lib/jobs/runner"

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const run = await withJobRun("cleanup", async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const deleted = await db.delete(webhookEvents).where(lt(webhookEvents.createdAt, cutoff))
    const count = deleted.rowCount ?? 0
    return {
      itemsProcessed: count,
      result: { deletedBefore: cutoff.toISOString(), count },
    }
  })

  return NextResponse.json({ ok: run.ok, correlationId: run.correlationId, durationMs: run.durationMs })
}

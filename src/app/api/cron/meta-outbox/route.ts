import { NextResponse } from "next/server"
import { processMetaOutbox } from "@/lib/meta-outbox/worker"
import { withJobRun } from "@/lib/jobs/runner"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const batchSize = Math.min(
    parseInt(new URL(req.url).searchParams.get("batch") ?? "50", 10),
    200
  )

  const run = await withJobRun("meta-outbox", async (ctx) => {
    const result = await processMetaOutbox(batchSize)
    return {
      itemsProcessed: result.processed,
      itemsFailed: result.failed,
      result: { ...result, correlationId: ctx.correlationId },
    }
  })

  return NextResponse.json({ ok: run.ok, correlationId: run.correlationId, durationMs: run.durationMs })
}

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { metaConnections } from "@/lib/db/schema"
import { decryptTokenVersioned } from "@/lib/crypto"
import { runInsightsSync } from "@/domains/meta-insights/sync-engine"
import { isAdAccountAllowed } from "@/domains/meta-insights/allowlist"
import { withJobRun } from "@/lib/jobs/runner"
import { and, eq, isNotNull } from "drizzle-orm"

export const maxDuration = 60

export async function GET(req: Request) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (
    process.env.META_CONNECTION_MODE === "external_oauth" &&
    process.env.ENABLE_EXTERNAL_META_OAUTH !== "true"
  ) {
    return NextResponse.json({ skipped: true, reason: "external_oauth_disabled" })
  }

  const run = await withJobRun("meta-insights-sync", async () => {
    const connections = await db.query.metaConnections.findMany({
      where: and(
        eq(metaConnections.status, "active"),
        isNotNull(metaConnections.adAccountId),
        isNotNull(metaConnections.accessTokenEnc),
      ),
    })

    let processed = 0
    let failed = 0
    const statuses: Array<{ adAccountId: string; status: string; recordsSynced?: number }> = []

    for (const conn of connections) {
      if (!conn.adAccountId || !conn.accessTokenEnc || !conn.clientId) continue

      const allowed = await isAdAccountAllowed(conn.adAccountId, conn.orgId)
      if (!allowed) {
        statuses.push({ adAccountId: conn.adAccountId, status: "skipped_not_allowed" })
        continue
      }

      let accessToken: string
      try {
        accessToken = decryptTokenVersioned(conn.accessTokenEnc)
      } catch {
        statuses.push({ adAccountId: conn.adAccountId, status: "decrypt_error" })
        failed++
        continue
      }

      const result = await runInsightsSync({
        connectionId: conn.id,
        orgId: conn.orgId,
        clientId: conn.clientId,
        adAccountId: conn.adAccountId,
        accessToken,
        graphApiVersion: conn.graphApiVersion,
        syncType: "incremental",
      })

      if (result.error) {
        statuses.push({ adAccountId: conn.adAccountId, status: "error", recordsSynced: result.recordsSynced })
        failed++
      } else {
        statuses.push({ adAccountId: conn.adAccountId, status: "ok", recordsSynced: result.recordsSynced })
        processed++
      }
    }

    return {
      itemsProcessed: processed,
      itemsFailed: failed,
      result: { total: connections.length, ok: processed, failed, statuses },
    }
  })

  return NextResponse.json({ ok: run.ok, correlationId: run.correlationId, durationMs: run.durationMs })
}

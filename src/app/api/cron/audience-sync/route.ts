import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { clients, metaConnections } from "@/lib/db/schema"
import { eq, and, isNotNull } from "drizzle-orm"
import { syncClientAudiences } from "@/domains/meta-audiences/sync"
import { withJobRun } from "@/lib/jobs/runner"

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const result = await withJobRun("audience-sync", async (_ctx) => {
    // Find all active connections that have an ad_account_id set
    const connections = await db
      .select({
        clientId: metaConnections.clientId,
        orgId: metaConnections.orgId,
      })
      .from(metaConnections)
      .where(
        and(
          eq(metaConnections.status, "active"),
          isNotNull(metaConnections.adAccountId),
          isNotNull(metaConnections.accessTokenEnc)
        )
      )

    let totalSynced = 0
    let totalErrors = 0

    for (const conn of connections) {
      const clientRow = await db.query.clients.findFirst({
        where: and(eq(clients.id, conn.clientId), eq(clients.orgId, conn.orgId)),
        columns: { name: true },
      })
      if (!clientRow) continue

      const r = await syncClientAudiences(conn.clientId, clientRow.name, conn.orgId)
      totalSynced += r.synced
      totalErrors += r.errors
    }

    return { itemsProcessed: totalSynced, itemsFailed: totalErrors }
  })

  return NextResponse.json(result)
}

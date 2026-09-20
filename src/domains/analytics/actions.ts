"use server"

import { db } from "@/lib/db"
import { auditLogs } from "@/lib/db/schema"
import { requireOrganizationMembership } from "@/lib/auth/server"

export async function logCsvExportAction(scope: string, rowCount: number) {
  let ctx
  try { ctx = await requireOrganizationMembership() } catch { return }
  await db
    .insert(auditLogs)
    .values({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "csv_export",
      resourceType: "performance_report",
      metadata: { scope, rowCount },
    })
    .catch(() => undefined)
}

import { NextResponse } from "next/server"
import { withJobRun } from "@/lib/jobs/runner"
import { getOrgsWithMonthlyReportEnabled, getClientsByOrgForReport } from "@/domains/analytics/report-actions"
import { getReportData } from "@/domains/analytics/reports"
import { sendMonthlyReportEmail } from "@/lib/email/monthly-report"
import { db } from "@/lib/db"
import { users, orgMembers } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function prevMonthRange(): { from: Date; to: Date; monthStr: string } {
  const now = new Date()
  const y = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
  const m = now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1
  const from = new Date(Date.UTC(y, m, 1))
  const to = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999))
  const monthStr = `${y}-${String(m + 1).padStart(2, "0")}`
  return { from, to, monthStr }
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""

  const run = await withJobRun("monthly-reports", async (ctx) => {
    const { from, to, monthStr } = prevMonthRange()
    const orgs = await getOrgsWithMonthlyReportEnabled()

    let emailsSent = 0
    let emailsFailed = 0

    for (const org of orgs) {
      if (ctx.isOverBudget(50_000)) break

      // Get owner email
      const ownerRow = await db
        .select({ email: users.email })
        .from(orgMembers)
        .innerJoin(users, eq(users.id, orgMembers.userId))
        .where(and(eq(orgMembers.orgId, org.id), eq(orgMembers.role, "owner")))
        .limit(1)
        .then((rows) => rows[0])

      if (!ownerRow?.email) continue

      const clients = await getClientsByOrgForReport(org.id)

      for (const client of clients) {
        if (ctx.isOverBudget(50_000)) break

        try {
          const report = await getReportData(org.id, client.id, from, to)
          if (!report || report.totalLeads === 0) continue

          const previewUrl = `${appUrl}/dashboard/reports/preview?clientId=${client.id}&month=${monthStr}`
          await sendMonthlyReportEmail({ to: ownerRow.email, report, previewUrl })
          emailsSent++
        } catch {
          emailsFailed++
        }
      }
    }

    return {
      itemsProcessed: emailsSent,
      itemsFailed: emailsFailed,
      result: { orgs: orgs.length, emailsSent, emailsFailed, month: monthStr },
    }
  })

  return NextResponse.json({ ok: run.ok, correlationId: run.correlationId, durationMs: run.durationMs })
}

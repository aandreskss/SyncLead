import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { listMembers } from "@/domains/members/repository"
import { PageShell } from "@/components/app/ops"
import TeamView from "./_components/TeamView"

export const dynamic = "force-dynamic"

export default async function TeamPage() {
  let ctx: Awaited<ReturnType<typeof requireOrganizationMembership>>
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    if (e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  if (!["owner", "admin"].includes(ctx.role)) redirect("/dashboard")

  const members = await listMembers(ctx.orgId)

  return (
    <PageShell>
      <TeamView
        members={members}
        currentUserId={ctx.userId}
        currentUserRole={ctx.role}
      />
    </PageShell>
  )
}

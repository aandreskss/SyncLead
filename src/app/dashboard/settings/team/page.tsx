import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { listMembers } from "@/domains/members/repository"
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
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Equipo</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Gestiona los miembros de tu organización y sus permisos de acceso.
        </p>
      </div>
      <TeamView
        members={members}
        currentUserId={ctx.userId}
        currentUserRole={ctx.role}
      />
    </div>
  )
}

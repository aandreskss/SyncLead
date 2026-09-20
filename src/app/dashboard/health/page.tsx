import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { getHealthSnapshot } from "@/domains/health/repository"
import HealthDashboard from "./_components/HealthDashboard"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function HealthPage() {
  let ctx: Awaited<ReturnType<typeof requireOrganizationMembership>>
  try {
    ctx = await requireOrganizationMembership()
  } catch {
    redirect("/login")
  }

  if (!["owner", "admin"].includes(ctx.role)) {
    redirect("/dashboard")
  }

  const snapshot = await getHealthSnapshot(ctx.orgId)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Salud del sistema</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Visión general de jobs, integraciones y cola CAPI — solo para administradores.
        </p>
      </div>
      <HealthDashboard snapshot={snapshot} />
    </div>
  )
}

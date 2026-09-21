import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { getOrganizationById } from "@/domains/organizations/repository"
import { DashboardNav } from "@/components/app/DashboardNav"
import { DashboardSidebar } from "@/components/app/DashboardSidebar"

const ROLE_LABELS: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  manager: "Gerente",
  agent: "Agente",
  viewer: "Solo lectura",
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let orgName: string
  let isAdmin = false
  let roleLabel = "Miembro"

  try {
    const ctx = await requireOrganizationMembership()
    const org = await getOrganizationById(ctx.orgId)
    if (!org) redirect("/login")
    orgName = org.name
    isAdmin = ctx.role === "owner" || ctx.role === "admin"
    roleLabel = ROLE_LABELS[ctx.role] ?? "Miembro"
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    if (e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  return (
    <div className="sg-app flex min-h-screen bg-ops-bg text-sg-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-sg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-sg-on-accent"
      >
        Saltar al contenido
      </a>

      {/* Sidebar (escritorio) */}
      <DashboardSidebar isAdmin={isAdmin} orgName={orgName} roleLabel={roleLabel} />

      {/* Contenido */}
      <main id="main" className="min-w-0 flex-1 overflow-auto pb-20 text-sg-ink md:pb-0">
        {children}
      </main>

      {/* Navegación inferior (móvil) */}
      <DashboardNav isAdmin={isAdmin} />
    </div>
  )
}

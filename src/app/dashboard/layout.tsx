import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { getOrganizationById } from "@/domains/organizations/repository"
import { DashboardNav } from "@/components/app/DashboardNav"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let orgName: string
  let isAdmin = false

  try {
    const ctx = await requireOrganizationMembership()
    const org = await getOrganizationById(ctx.orgId)
    if (!org) redirect("/login")
    orgName = org.name
    isAdmin = ctx.role === "owner" || ctx.role === "admin"
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    if (e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  return (
    <div className="sg-app flex min-h-screen bg-sg-bg text-sg-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-sg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-sg-on-accent"
      >
        Saltar al contenido
      </a>

      {/* Sidebar (escritorio) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sg-border bg-sg-s1 md:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-sg-border px-5">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-sg-accent text-sg-on-accent"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 15 6-6 6 6" />
            </svg>
          </span>
          <span className="text-sm font-bold tracking-tight text-sg-ink">SyncLead</span>
        </div>
        <DashboardNav isAdmin={isAdmin} variant="side" />
        <div className="border-t border-sg-border p-3">
          <p className="truncate px-3 text-xs text-sg-subtle">{orgName}</p>
        </div>
      </aside>

      {/* Contenido */}
      <main id="main" className="min-w-0 flex-1 overflow-auto pb-20 text-sg-ink md:pb-0">
        {children}
      </main>

      {/* Navegación inferior (móvil) */}
      <DashboardNav isAdmin={isAdmin} variant="bottom" />
    </div>
  )
}

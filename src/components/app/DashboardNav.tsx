"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  Building,
  ChartColumn,
  FileBarChart2,
  Funnel,
  LayoutDashboard,
  Megaphone,
  Upload,
  User,
  Users,
} from "lucide-react"
import type { ComponentType, SVGProps } from "react"
import { cn } from "@/lib/utils"

export type NavItem = {
  href: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  adminOnly?: boolean
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "General",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/dashboard/clients", label: "Clientes", icon: Building },
      { href: "/dashboard/campaigns", label: "Campañas", icon: Megaphone },
    ],
  },
  {
    label: "Análisis",
    items: [
      { href: "/dashboard/performance", label: "Rendimiento", icon: ChartColumn },
      { href: "/dashboard/funnels", label: "Embudos", icon: Funnel },
      { href: "/dashboard/reports", label: "Reportes", icon: FileBarChart2 },
      { href: "/dashboard/health", label: "Salud del tracking", icon: Activity, adminOnly: true },
    ],
  },
  {
    label: "Gestión",
    items: [
      { href: "/dashboard/import", label: "Importar", icon: Upload },
      { href: "/dashboard/settings/team", label: "Equipo", icon: Users, adminOnly: true },
      { href: "/dashboard/settings/account", label: "Mi cuenta", icon: User },
    ],
  },
]

export function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Navegación inferior (móvil). La barra lateral de escritorio vive en
 * DashboardSidebar. La sección activa se marca con `aria-current` y con
 * cambio de contraste (nunca solo color).
 */
export function DashboardNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const items = NAV_GROUPS.flatMap((g) => g.items).filter((i) => !i.adminOnly || isAdmin)

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-ops-line bg-ops-side px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-14 min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 px-2 text-[11px] font-medium transition-colors duration-150",
              active ? "text-ops-tx" : "text-ops-tx2"
            )}
          >
            {active && <span aria-hidden className="absolute inset-x-3 top-0 h-0.5 rounded-b bg-ops-blue" />}
            <Icon className={cn("h-5 w-5", active && "text-ops-blue-t")} aria-hidden="true" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

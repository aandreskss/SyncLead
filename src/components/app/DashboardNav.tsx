"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Building,
  ChartColumn,
  Funnel,
  LayoutDashboard,
  Megaphone,
  ShieldCheck,
  Upload,
  User,
  Users,
} from "lucide-react"
import type { ComponentType, SVGProps } from "react"
import { cn } from "@/lib/utils"

type NavItem = {
  href: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  adminOnly?: boolean
}

const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/clients", label: "Clientes", icon: Building },
  { href: "/dashboard/campaigns", label: "Campañas", icon: Megaphone },
  { href: "/dashboard/performance", label: "Rendimiento", icon: ChartColumn },
  { href: "/dashboard/funnels", label: "Embudos", icon: Funnel },
  { href: "/dashboard/import", label: "Importar", icon: Upload },
  { href: "/dashboard/health", label: "Salud", icon: ShieldCheck, adminOnly: true },
  { href: "/dashboard/settings/team", label: "Equipo", icon: Users, adminOnly: true },
  { href: "/dashboard/settings/account", label: "Mi cuenta", icon: User },
]

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname === href || pathname.startsWith(`${href}/`)
}

interface Props {
  isAdmin: boolean
  variant: "side" | "bottom"
}

/**
 * Navegación principal del dashboard. Marca la sección activa con `aria-current`
 * y con un cambio de fondo + icono en acento (nunca solo color).
 */
export function DashboardNav({ isAdmin, variant }: Props) {
  const pathname = usePathname()
  const items = ITEMS.filter((i) => !i.adminOnly || isAdmin)

  if (variant === "bottom") {
    return (
      <nav
        aria-label="Principal"
        className="sg-glass fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-sg-border px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "sg-press flex min-h-14 min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-[11px] font-semibold transition-colors",
                active ? "text-sg-ink" : "text-sg-muted"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "text-sg-accent")} aria-hidden="true" />
              {label}
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <nav aria-label="Principal" className="flex-1 space-y-1 p-3">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "sg-press flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition-colors duration-[var(--sg-dur-quick)]",
              active
                ? "bg-sg-s3 text-sg-ink"
                : "text-sg-muted hover:bg-sg-s2 hover:text-sg-ink"
            )}
          >
            <Icon className={cn("h-4 w-4", active && "text-sg-accent")} aria-hidden="true" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

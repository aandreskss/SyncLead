"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSyncExternalStore } from "react"
import { PanelLeft, PanelLeftClose, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { NAV_GROUPS, isActive } from "./DashboardNav"
import { ThemeToggle } from "./ThemeToggle"

const KEY = "synclead:sidebar-collapsed"
const EVENT = "synclead:sidebar"

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener("storage", cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener("storage", cb)
  }
}

function readCollapsed() {
  try {
    return window.localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

function toggleCollapsed() {
  try {
    window.localStorage.setItem(KEY, readCollapsed() ? "0" : "1")
  } catch {
    /* almacenamiento no disponible: el estado no se recuerda */
  }
  window.dispatchEvent(new Event(EVENT))
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "S") + (parts[1]?.[0] ?? "")).toUpperCase()
}

interface Props {
  isAdmin: boolean
  orgName: string
  roleLabel: string
}

export function DashboardSidebar({ isAdmin, orgName, roleLabel }: Props) {
  const pathname = usePathname()
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false)

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-ops-line bg-ops-side transition-[width] duration-200 md:flex",
        collapsed ? "w-16" : "w-[220px]"
      )}
    >
      {/* Marca */}
      <div className={cn("flex h-14 items-center", collapsed ? "justify-center" : "px-4")}>
        <Link href="/dashboard" aria-label="SyncLead, ir al dashboard" className="flex items-center gap-2.5">
          <span aria-hidden className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-ops-blue text-ops-bg">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 9h13" />
              <path d="m13 5 4 4-4 4" />
              <path d="M20 15H7" />
              <path d="m11 19-4-4 4-4" />
            </svg>
          </span>
          {!collapsed && <span className="text-base font-semibold tracking-tight text-ops-tx">SyncLead</span>}
        </Link>
      </div>

      {/* Workspace */}
      <div className={cn("pb-4 pt-1", collapsed ? "flex justify-center" : "px-3")}>
        <div
          title={orgName}
          className={cn(
            "flex items-center gap-2.5 rounded-lg border border-ops-bd bg-ops-s1",
            collapsed ? "h-10 w-10 justify-center" : "h-11 px-2.5"
          )}
        >
          <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--ops-ws-badge)] text-[11px] font-semibold text-ops-blue-t">
            {initials(orgName)}
          </span>
          {!collapsed && <span className="min-w-0 flex-1 truncate text-sm font-medium text-ops-tx">{orgName}</span>}
          {collapsed && <span className="sr-only">{orgName}</span>}
        </div>
      </div>

      {/* Navegación */}
      <nav aria-label="Principal" className="flex-1 overflow-y-auto pb-3">
        {NAV_GROUPS.map((group, gi) => {
          const items = group.items.filter((i) => !i.adminOnly || isAdmin).filter((i) => i.href !== "/dashboard/settings/account")
          if (items.length === 0) return null
          return (
            <div key={group.label}>
              {collapsed ? (
                gi > 0 && <div aria-hidden className="mx-4 my-2.5 h-px bg-ops-line" />
              ) : (
                <p className={cn("px-[22px] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ops-tx3", gi === 0 ? "pt-1" : "pt-4")}>
                  {group.label}
                </p>
              )}
              {items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href)
                return (
                  <Link
                    key={href}
                    href={href}
                    title={collapsed ? label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative mx-2 flex h-10 items-center rounded-md text-sm font-medium transition-colors duration-150",
                      collapsed ? "justify-center" : "gap-3 px-3.5",
                      active ? "bg-ops-s2 text-ops-tx" : "text-ops-tx2 hover:bg-ops-hover hover:text-ops-tx"
                    )}
                  >
                    {active && <span aria-hidden className="absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-r bg-ops-blue" />}
                    <Icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-[18px] w-[18px]", active && "text-ops-blue-t")} aria-hidden="true" />
                    {collapsed ? <span className="sr-only">{label}</span> : <span>{label}</span>}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Perfil, configuración y contraer */}
      <div className={cn("border-t border-ops-line p-3", collapsed && "flex flex-col items-center gap-1.5")}>
        {!collapsed && (
          <div className="mb-2.5 px-1">
            <p className="truncate text-[13px] font-medium text-ops-tx">{orgName}</p>
            <p className="text-xs text-ops-tx3">{roleLabel}</p>
          </div>
        )}
        <div className={cn("flex items-center gap-1.5", collapsed && "flex-col")}>
          <Link
            href="/dashboard/settings/account"
            title="Mi cuenta"
            aria-current={isActive(pathname, "/dashboard/settings/account") ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-2 rounded-md border border-ops-bd text-[13px] text-ops-tx2 transition-colors duration-150 hover:border-ops-bd2 hover:bg-ops-raised hover:text-ops-tx",
              collapsed ? "w-9 justify-center" : "flex-1 px-2.5"
            )}
          >
            <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
            {collapsed ? <span className="sr-only">Mi cuenta</span> : "Mi cuenta"}
          </Link>
          <ThemeToggle collapsed={collapsed} />
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
            aria-pressed={collapsed}
            title={collapsed ? "Expandir" : "Contraer"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ops-bd text-ops-tx2 transition-colors duration-150 hover:border-ops-bd2 hover:bg-ops-raised hover:text-ops-tx"
          >
            {collapsed ? <PanelLeft className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </aside>
  )
}

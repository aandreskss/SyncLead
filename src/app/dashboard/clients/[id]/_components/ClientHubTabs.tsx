"use client"
import Link from "next/link"
import { LayoutDashboard, Users, Settings, Activity, Radio } from "lucide-react"

const TABS = [
  { key: "resumen", label: "Resumen", Icon: LayoutDashboard },
  { key: "leads", label: "Leads", Icon: Users },
  { key: "fuentes", label: "Fuentes", Icon: Radio },
  { key: "configuracion", label: "Configuración", Icon: Settings },
  { key: "diagnostico", label: "Diagnóstico", Icon: Activity },
]

export function ClientHubTabs({ clientId, currentTab }: { clientId: string; currentTab: string }) {
  return (
    <nav aria-label="Secciones del cliente" className="flex gap-1 overflow-x-auto border-b border-ops-line">
      {TABS.map(({ key, label, Icon }) => {
        const active = currentTab === key
        return (
          <Link
            key={key}
            href={`/dashboard/clients/${clientId}?tab=${key}`}
            aria-current={active ? "page" : undefined}
            className={`flex h-10 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ops-blue ${
              active
                ? "border-ops-blue bg-ops-sel text-ops-tx"
                : "border-transparent text-ops-tx2 hover:bg-ops-hover hover:text-ops-tx"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

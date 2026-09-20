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
    <div className="flex border-b border-zinc-800 gap-1">
      {TABS.map(({ key, label, Icon }) => {
        const active = currentTab === key
        return (
          <Link
            key={key}
            href={`/dashboard/clients/${clientId}?tab=${key}`}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              active
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        )
      })}
    </div>
  )
}

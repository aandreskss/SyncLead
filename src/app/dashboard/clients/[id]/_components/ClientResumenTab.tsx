import Link from "next/link"
import type { CampaignWithCounts } from "@/domains/campaigns/repository"
import type { Client } from "@/lib/db/schema"
import { CheckCircle2, Circle } from "lucide-react"

interface Props {
  client: Client
  campaigns: CampaignWithCounts[]
  hasMetaConnection: boolean
  hasSalesReps: boolean
}

export function ClientResumenTab({ client, campaigns, hasMetaConnection, hasSalesReps }: Props) {
  const totalLeads = campaigns.reduce((sum, c) => sum + c.leadCount, 0)
  const totalSales = campaigns.reduce((sum, c) => sum + c.saleCount, 0)
  const activeCampaigns = campaigns.filter((c) => c.active).length

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 mb-1">Total leads</p>
          <p className="text-2xl font-bold text-zinc-100">{totalLeads}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 mb-1">Campañas</p>
          <p className="text-2xl font-bold text-zinc-100">{campaigns.length}</p>
          {activeCampaigns !== campaigns.length && (
            <p className="text-xs text-zinc-600 mt-0.5">{activeCampaigns} activas</p>
          )}
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 mb-1">Ventas confirmadas</p>
          <p className="text-2xl font-bold text-emerald-400">{totalSales}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 mb-1">WhatsApp</p>
          <p className="text-2xl font-bold text-zinc-100">{(client.whatsappNumbers ?? []).length}</p>
          <p className="text-xs text-zinc-600 mt-0.5">números</p>
        </div>
      </div>

      {/* Campaigns Table */}
      {campaigns.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-400">Campañas</h2>
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Nombre</th>
                  <th className="px-4 py-3 text-center font-medium text-zinc-400">Leads</th>
                  <th className="px-4 py-3 text-center font-medium text-zinc-400">Ventas</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-400">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/campaigns/${c.id}/leads`}
                        className="font-medium text-zinc-100 hover:text-indigo-400 transition-colors"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center text-zinc-300">{c.leadCount}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={c.saleCount > 0 ? "text-emerald-400 font-medium" : "text-zinc-600"}>
                        {c.saleCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        c.active ? "text-emerald-400 bg-emerald-400/10" : "text-zinc-500 bg-zinc-700/50"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${c.active ? "bg-emerald-400" : "bg-zinc-500"}`} />
                        {c.active ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {campaigns.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center">
          <p className="text-zinc-500 text-sm">Sin campañas todavía.</p>
          <p className="text-zinc-600 text-xs mt-1">
            Las campañas capturan leads y los asignan a este cliente.
          </p>
        </div>
      )}

      {/* Status checklist */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-400">Estado de configuración</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800">
          <div className="flex items-center gap-3 px-4 py-3">
            {hasMetaConnection ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-zinc-600 flex-shrink-0" />
            )}
            <div>
              <p className={`text-sm font-medium ${hasMetaConnection ? "text-zinc-200" : "text-zinc-500"}`}>
                CAPI activo
              </p>
              <p className="text-xs text-zinc-600">Conexión Meta Conversions API</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            {hasSalesReps ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-zinc-600 flex-shrink-0" />
            )}
            <div>
              <p className={`text-sm font-medium ${hasSalesReps ? "text-zinc-200" : "text-zinc-500"}`}>
                Vendedores asignados
              </p>
              <p className="text-xs text-zinc-600">Equipo de ventas configurado</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

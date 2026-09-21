import Link from "next/link"
import type { CampaignWithCounts } from "@/domains/campaigns/repository"
import type { Client } from "@/lib/db/schema"
import { CheckCircle2, Circle } from "lucide-react"
import { Panel, StatusChip, opsTable } from "@/components/app/ops"

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

  const kpis: { label: string; value: number; sub?: string; tone?: string }[] = [
    { label: "Total leads", value: totalLeads },
    { label: "Campañas", value: campaigns.length, sub: activeCampaigns !== campaigns.length ? `${activeCampaigns} activas` : undefined },
    { label: "Ventas confirmadas", value: totalSales, tone: "text-ops-green" },
    { label: "WhatsApp", value: (client.whatsappNumbers ?? []).length, sub: "números" },
  ]
  const checks = [
    { ok: hasMetaConnection, title: "CAPI activo", text: "Conexión Meta Conversions API" },
    { ok: hasSalesReps, title: "Vendedores asignados", text: "Equipo de ventas configurado" },
  ]

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-ops-line bg-ops-s1 sm:grid-cols-4">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`p-4 ${i % 2 === 1 ? "border-l border-ops-line" : ""} ${i > 1 ? "border-t border-ops-line sm:border-t-0" : ""} ${i > 0 ? "sm:border-l sm:border-ops-line" : ""}`}
          >
            <dt className="text-xs text-ops-tx3">{k.label}</dt>
            <dd className={`mt-1 font-plex text-[26px] font-medium leading-tight tabular-nums ${k.tone ?? "text-ops-tx"}`}>{k.value}</dd>
            {k.sub && <p className="mt-0.5 text-xs text-ops-tx3">{k.sub}</p>}
          </div>
        ))}
      </dl>

      {campaigns.length > 0 && (
        <Panel title="Campañas">
          <div className={opsTable.wrap}>
            <table className={`${opsTable.table} min-w-[480px]`}>
              <thead>
                <tr>
                  <th className={opsTable.th}>Nombre</th>
                  <th className={opsTable.thRight}>Leads</th>
                  <th className={opsTable.thRight}>Ventas</th>
                  <th className={opsTable.thRight}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className={opsTable.row}>
                    <td className={opsTable.td}>
                      <Link
                        href={`/dashboard/campaigns/${c.id}/leads`}
                        className="font-medium text-ops-tx hover:text-ops-blue-t focus-visible:outline-2 focus-visible:outline-ops-blue"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className={`${opsTable.tdRight} ${opsTable.mono}`}>{c.leadCount}</td>
                    <td className={`${opsTable.tdRight} ${opsTable.mono} ${c.saleCount > 0 ? "text-ops-green" : "text-ops-tx3"}`}>{c.saleCount}</td>
                    <td className={opsTable.tdRight}>
                      <StatusChip tone={c.active ? "green" : "amber"}>{c.active ? "Activa" : "Inactiva"}</StatusChip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {campaigns.length === 0 && (
        <div className="rounded-lg border border-dashed border-ops-bd p-8 text-center">
          <p className="text-sm text-ops-tx2">Sin campañas todavía.</p>
          <p className="mt-1 text-xs text-ops-tx3">Las campañas capturan leads y los asignan a este cliente.</p>
        </div>
      )}

      <Panel title="Estado de configuración">
        <ul className="divide-y divide-ops-line border-t border-ops-line">
          {checks.map((c) => (
            <li key={c.title} className="flex items-center gap-3 px-4 py-3">
              {c.ok ? (
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-ops-green" aria-hidden />
              ) : (
                <Circle className="h-4 w-4 flex-shrink-0 text-ops-tx3" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${c.ok ? "text-ops-tx" : "text-ops-tx2"}`}>{c.title}</p>
                <p className="text-xs text-ops-tx3">{c.text}</p>
              </div>
              <StatusChip tone={c.ok ? "green" : "amber"}>{c.ok ? "Configurado" : "Pendiente"}</StatusChip>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

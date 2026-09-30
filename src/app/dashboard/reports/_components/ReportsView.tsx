"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import {
  Users, TrendingUp, DollarSign, BarChart3,
  Download, Mail, MailCheck, ExternalLink, ChevronLeft, ChevronRight,
} from "lucide-react"
import type { ReportData } from "@/domains/analytics/reports"
import { toggleMonthlyReportAction } from "@/domains/analytics/report-actions"
import { Panel, opsTable, opsBtnPrimary, opsBtnSecondary, opsField, EmptyState } from "@/components/app/ops"

interface Props {
  clients: { id: string; name: string }[]
  selectedClientId: string | null
  month: string
  reportData: ReportData | null
  monthlyEmailEnabled: boolean
}

function fmt(n: number, currency?: string | null) {
  if (currency) return new Intl.NumberFormat("es", { style: "currency", currency, maximumFractionDigits: 2 }).format(n)
  return new Intl.NumberFormat("es").format(n)
}

function pct(n: number) {
  return `${n.toFixed(1)}%`
}

function prevMonth(month: string) {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es", { month: "long", year: "numeric" })
}

function isCurrentOrFuture(month: string) {
  const now = new Date()
  const cur = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
  return month >= cur
}

export function ReportsView({ clients, selectedClientId, month, reportData, monthlyEmailEnabled }: Props) {
  const router = useRouter()
  const [monthly, setMonthly] = useState(monthlyEmailEnabled)
  const [toggling, startToggle] = useTransition()

  function navigate(clientId: string | null, m: string) {
    const p = new URLSearchParams()
    if (clientId) p.set("clientId", clientId)
    p.set("month", m)
    router.push(`/dashboard/reports?${p.toString()}`)
  }

  function handleToggleEmail() {
    const next = !monthly
    setMonthly(next)
    startToggle(async () => {
      await toggleMonthlyReportAction(next)
    })
  }

  const previewUrl = selectedClientId
    ? `/api/reports/preview?clientId=${selectedClientId}&month=${month}`
    : null

  const r = reportData

  return (
    <div className="space-y-5">
      {/* Controls */}
      <Panel>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Client selector */}
          <div className="flex items-center gap-2">
            <select
              value={selectedClientId ?? ""}
              onChange={(e) => navigate(e.target.value || null, month)}
              className={opsField + " pr-8"}
            >
              <option value="">— Selecciona un cliente —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Month navigator */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(selectedClientId, prevMonth(month))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ops-bd bg-ops-s1 text-ops-tx3 transition-colors hover:border-ops-bd2 hover:text-ops-tx"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 text-sm font-medium text-ops-tx capitalize min-w-[140px] text-center">
              {monthLabel(month)}
            </span>
            <button
              onClick={() => navigate(selectedClientId, nextMonth(month))}
              disabled={isCurrentOrFuture(month)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ops-bd bg-ops-s1 text-ops-tx3 transition-colors hover:border-ops-bd2 hover:text-ops-tx disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleEmail}
              disabled={toggling}
              className={monthly
                ? "inline-flex items-center gap-1.5 rounded-full border border-ops-green/40 bg-ops-green-bg px-4 py-2 text-sm font-medium text-ops-green transition-colors disabled:opacity-50"
                : opsBtnSecondary + " disabled:opacity-50"
              }
            >
              {monthly ? <MailCheck className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
              {monthly ? "Email mensual activo" : "Activar email mensual"}
            </button>
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={opsBtnSecondary}
              >
                <Download className="h-3.5 w-3.5" />
                Ver / Descargar PDF
              </a>
            )}
          </div>
        </div>
      </Panel>

      {!r ? (
        <Panel>
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="Selecciona un cliente para ver su reporte"
            text="Elige un cliente en el selector de arriba para visualizar el resumen mensual."
          />
        </Panel>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              label="Leads captados"
              value={fmt(r.totalLeads)}
              icon={<Users className="h-4 w-4" />}
              sub={`${r.hotLeads} calientes · ${r.warmLeads} tibios · ${r.coldLeads} fríos`}
              color="blue"
            />
            <KpiCard
              label="Ventas confirmadas"
              value={fmt(r.totalSales)}
              icon={<TrendingUp className="h-4 w-4" />}
              sub={r.totalLeads > 0 ? `${pct((r.totalSales / r.totalLeads) * 100)} tasa de conversión` : "—"}
              color="green"
            />
            <KpiCard
              label="Ingresos"
              value={r.totalRevenue !== null ? fmt(r.totalRevenue, r.primaryCurrency) : "N/D"}
              icon={<DollarSign className="h-4 w-4" />}
              sub={r.primaryCurrency ?? "Moneda mixta"}
              color="amber"
            />
            <KpiCard
              label="ROAS"
              value={r.roas !== null ? `${r.roas.toFixed(2)}×` : "N/D"}
              icon={<BarChart3 className="h-4 w-4" />}
              sub={r.totalSpend !== null ? `Gasto: ${fmt(r.totalSpend, r.primaryCurrency)}` : "Sin datos de gasto"}
              color="coral"
            />
          </div>

          {/* Temperature bar */}
          {r.totalLeads > 0 && (
            <Panel>
              <div className="p-4 space-y-3">
                <p className="text-sm font-semibold text-ops-tx">Distribución de temperatura</p>
                <div className="flex h-4 w-full overflow-hidden rounded-full bg-ops-s2">
                  {r.hotLeads > 0 && (
                    <div
                      style={{ width: `${(r.hotLeads / r.totalLeads) * 100}%` }}
                      className="bg-ops-coral"
                      title={`Calientes: ${r.hotLeads}`}
                    />
                  )}
                  {r.warmLeads > 0 && (
                    <div
                      style={{ width: `${(r.warmLeads / r.totalLeads) * 100}%` }}
                      className="bg-ops-amber"
                      title={`Tibios: ${r.warmLeads}`}
                    />
                  )}
                  {r.coldLeads > 0 && (
                    <div
                      style={{ width: `${(r.coldLeads / r.totalLeads) * 100}%` }}
                      className="bg-ops-bd2"
                      title={`Fríos: ${r.coldLeads}`}
                    />
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-ops-tx3">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-ops-coral" />
                    {r.hotLeads} calientes
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-ops-amber" />
                    {r.warmLeads} tibios
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-ops-bd2" />
                    {r.coldLeads} fríos
                  </span>
                </div>
              </div>
            </Panel>
          )}

          {/* Campaign table */}
          {r.campaigns.length > 0 && (
            <Panel
              title="Desglose por campaña"
              actions={
                <span className="text-xs text-ops-tx3">
                  {r.campaigns.length} campaña{r.campaigns.length !== 1 ? "s" : ""}
                </span>
              }
            >
              <div className={opsTable.wrap}>
                <table className={opsTable.table}>
                  <thead>
                    <tr>
                      {["Campaña", "Leads", "Hot", "Tibio", "Frío", "Ventas", "Ingreso", "Gasto", "ROAS"].map((h, i) => (
                        <th key={h} className={i === 0 ? opsTable.th : opsTable.thRight}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.campaigns.map((c) => (
                      <tr key={c.campaignId} className={opsTable.row}>
                        <td className={opsTable.td + " font-medium max-w-[180px] truncate"}>{c.campaignName}</td>
                        <td className={opsTable.tdRight}>{c.totalLeads}</td>
                        <td className={opsTable.tdRight + " text-ops-coral font-medium"}>{c.hotLeads}</td>
                        <td className={opsTable.tdRight + " text-ops-amber font-medium"}>{c.warmLeads}</td>
                        <td className={opsTable.tdRight + " text-ops-tx3"}>{c.coldLeads}</td>
                        <td className={opsTable.tdRight}>{c.totalSales}</td>
                        <td className={opsTable.tdRight}>
                          {c.totalRevenue !== null ? fmt(c.totalRevenue, c.currency) : "—"}
                        </td>
                        <td className={opsTable.tdRight + " text-ops-tx3"}>
                          {c.totalSpend !== null ? fmt(c.totalSpend, c.currency) : "—"}
                        </td>
                        <td className={opsTable.tdRight + " font-medium"}>
                          {c.roas !== null ? `${c.roas.toFixed(2)}×` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {/* Link to full report */}
          {previewUrl && (
            <Panel>
              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-sm font-semibold text-ops-tx">Reporte completo para cliente</p>
                  <p className="text-xs text-ops-tx3 mt-0.5">Vista de presentación con PDF descargable</p>
                </div>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={opsBtnPrimary}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir reporte
                </a>
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  )
}

function KpiCard({
  label, value, icon, sub, color,
}: {
  label: string
  value: string
  icon: React.ReactNode
  sub: string
  color: "blue" | "green" | "amber" | "coral"
}) {
  const colors: Record<string, { iconWrap: string; value: string }> = {
    blue:  { iconWrap: "bg-ops-blue-bg text-ops-blue",  value: "text-ops-blue" },
    green: { iconWrap: "bg-ops-green-bg text-ops-green", value: "text-ops-green" },
    amber: { iconWrap: "bg-ops-amber-bg text-ops-amber", value: "text-ops-amber" },
    coral: { iconWrap: "bg-ops-coral-bg text-ops-coral", value: "text-ops-coral" },
  }
  const c = colors[color]
  return (
    <div className="rounded-[20px] border border-ops-line bg-ops-s1 p-5 shadow-ops-card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ops-tx3">{label}</p>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.iconWrap}`}>
          {icon}
        </span>
      </div>
      <p className={`text-[28px] font-bold leading-none tabular-nums tracking-tight ${c.value}`}>{value}</p>
      <p className="text-xs text-ops-tx3 truncate">{sub}</p>
    </div>
  )
}

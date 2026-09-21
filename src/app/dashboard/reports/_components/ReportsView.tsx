"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
import {
  Users, TrendingUp, DollarSign, BarChart3,
  Download, Mail, MailCheck, ExternalLink, ChevronLeft, ChevronRight,
} from "lucide-react"
import type { ReportData } from "@/domains/analytics/reports"
import { toggleMonthlyReportAction } from "@/domains/analytics/report-actions"

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
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Client selector */}
        <div className="flex items-center gap-2">
          <select
            value={selectedClientId ?? ""}
            onChange={(e) => navigate(e.target.value || null, month)}
            className="rounded border border-ops-bd bg-ops-s2 px-3 py-2 text-sm text-ops-tx focus:outline-none focus:border-ops-blue/50"
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
            className="rounded border border-ops-bd bg-ops-s2 p-1.5 text-ops-tx3 hover:text-ops-tx hover:border-ops-bd2 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-3 text-sm font-medium text-ops-tx capitalize min-w-[140px] text-center">
            {monthLabel(month)}
          </span>
          <button
            onClick={() => navigate(selectedClientId, nextMonth(month))}
            disabled={isCurrentOrFuture(month)}
            className="rounded border border-ops-bd bg-ops-s2 p-1.5 text-ops-tx3 hover:text-ops-tx hover:border-ops-bd2 transition-colors disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleEmail}
            disabled={toggling}
            className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
              monthly
                ? "border-ops-green/40 bg-ops-green/10 text-ops-green"
                : "border-ops-bd bg-ops-s2 text-ops-tx3 hover:text-ops-tx"
            }`}
          >
            {monthly ? <MailCheck className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
            {monthly ? "Email mensual activo" : "Activar email mensual"}
          </button>
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded border border-ops-bd bg-ops-s2 px-3 py-1.5 text-xs font-medium text-ops-tx3 hover:text-ops-tx hover:border-ops-bd2 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Ver / Descargar PDF
            </a>
          )}
        </div>
      </div>

      {!r ? (
        <div className="rounded-lg border border-ops-bd bg-ops-s1 px-6 py-16 text-center text-ops-tx3">
          Selecciona un cliente para ver su reporte
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
              color="purple"
            />
          </div>

          {/* Temperature bar */}
          {r.totalLeads > 0 && (
            <div className="rounded-lg border border-ops-bd bg-ops-s1 p-4 space-y-3">
              <p className="text-sm font-medium text-ops-tx">Distribución de temperatura</p>
              <div className="flex h-4 w-full overflow-hidden rounded-full">
                {r.hotLeads > 0 && (
                  <div
                    style={{ width: `${(r.hotLeads / r.totalLeads) * 100}%` }}
                    className="bg-red-500"
                    title={`Calientes: ${r.hotLeads}`}
                  />
                )}
                {r.warmLeads > 0 && (
                  <div
                    style={{ width: `${(r.warmLeads / r.totalLeads) * 100}%` }}
                    className="bg-amber-500"
                    title={`Tibios: ${r.warmLeads}`}
                  />
                )}
                {r.coldLeads > 0 && (
                  <div
                    style={{ width: `${(r.coldLeads / r.totalLeads) * 100}%` }}
                    className="bg-zinc-500"
                    title={`Fríos: ${r.coldLeads}`}
                  />
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-ops-tx3">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />{r.hotLeads} calientes</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />{r.warmLeads} tibios</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-zinc-500" />{r.coldLeads} fríos</span>
              </div>
            </div>
          )}

          {/* Campaign table */}
          {r.campaigns.length > 0 && (
            <div className="rounded-lg border border-ops-bd bg-ops-s1 overflow-hidden">
              <div className="px-4 py-3 border-b border-ops-bd flex items-center justify-between">
                <p className="text-sm font-medium text-ops-tx">Desglose por campaña</p>
                <span className="text-xs text-ops-tx3">{r.campaigns.length} campaña{r.campaigns.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ops-bd">
                      {["Campaña", "Leads", "🔴 Hot", "🟡 Tibio", "⚪ Frío", "Ventas", "Ingreso", "Gasto", "ROAS"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-ops-tx3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ops-bd">
                    {r.campaigns.map((c) => (
                      <tr key={c.campaignId} className="hover:bg-ops-sel/50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-ops-tx max-w-[180px] truncate">{c.campaignName}</td>
                        <td className="px-4 py-2.5 text-ops-tx2">{c.totalLeads}</td>
                        <td className="px-4 py-2.5 text-red-400">{c.hotLeads}</td>
                        <td className="px-4 py-2.5 text-amber-400">{c.warmLeads}</td>
                        <td className="px-4 py-2.5 text-ops-tx3">{c.coldLeads}</td>
                        <td className="px-4 py-2.5 text-ops-tx2">{c.totalSales}</td>
                        <td className="px-4 py-2.5 text-ops-tx2">
                          {c.totalRevenue !== null ? fmt(c.totalRevenue, c.currency) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-ops-tx3">
                          {c.totalSpend !== null ? fmt(c.totalSpend, c.currency) : "—"}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-ops-tx2">
                          {c.roas !== null ? `${c.roas.toFixed(2)}×` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Link to full report */}
          {previewUrl && (
            <div className="rounded-lg border border-ops-bd bg-ops-s1 px-4 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ops-tx">Reporte completo para cliente</p>
                <p className="text-xs text-ops-tx3 mt-0.5">Vista de presentación con PDF descargable</p>
              </div>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded bg-ops-blue px-4 py-2 text-xs font-medium text-white hover:bg-ops-blue/80 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir reporte
              </a>
            </div>
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
  color: "blue" | "green" | "amber" | "purple"
}) {
  const colors = {
    blue:   { bg: "bg-ops-blue/10",   text: "text-ops-blue-t",  icon: "text-ops-blue-t" },
    green:  { bg: "bg-ops-green/10",  text: "text-ops-green",   icon: "text-ops-green" },
    amber:  { bg: "bg-amber-500/10",  text: "text-amber-400",   icon: "text-amber-400" },
    purple: { bg: "bg-purple-500/10", text: "text-purple-400",  icon: "text-purple-400" },
  }
  const c = colors[color]
  return (
    <div className="rounded-lg border border-ops-bd bg-ops-s1 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ops-tx3">{label}</p>
        <span className={`${c.bg} ${c.icon} rounded p-1`}>{icon}</span>
      </div>
      <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
      <p className="text-xs text-ops-tx3 truncate">{sub}</p>
    </div>
  )
}

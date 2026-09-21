import "server-only"

import { Resend } from "resend"
import type { ReportData } from "@/domains/analytics/reports"

function fmt(n: number, currency?: string | null) {
  if (currency) return new Intl.NumberFormat("es", { style: "currency", currency, maximumFractionDigits: 2 }).format(n)
  return new Intl.NumberFormat("es").format(n)
}

function pct(n: number) { return `${n.toFixed(1)}%` }

function monthLabel(from: Date) {
  return from.toLocaleDateString("es", { month: "long", year: "numeric" })
}

function buildHtml(r: ReportData, previewUrl: string): string {
  const convRate = r.totalLeads > 0 ? pct((r.totalSales / r.totalLeads) * 100) : "—"
  const label = monthLabel(r.from)

  const campaignRows = r.campaigns.slice(0, 10).map((c) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:10px 12px;font-size:13px;color:#111827;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.campaignName}</td>
      <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:center;">${c.totalLeads}</td>
      <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:center;">${c.totalSales}</td>
      <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:center;">${c.totalRevenue !== null ? fmt(c.totalRevenue, c.currency) : "—"}</td>
      <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:center;">${c.roas !== null ? `${c.roas.toFixed(2)}×` : "—"}</td>
    </tr>`).join("")

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:32px 40px;">
      <p style="margin:0;font-size:12px;color:#93c5fd;text-transform:uppercase;letter-spacing:.1em;">Reporte mensual</p>
      <h1 style="margin:8px 0 4px;font-size:24px;font-weight:700;color:#fff;text-transform:capitalize;">${label}</h1>
      <p style="margin:0;font-size:15px;color:#bfdbfe;">${r.clientName}</p>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid #e5e7eb;">
      <div style="padding:24px 28px;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Leads captados</p>
        <p style="margin:0;font-size:28px;font-weight:700;color:#1d4ed8;">${fmt(r.totalLeads)}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">${r.hotLeads} calientes · ${r.warmLeads} tibios · ${r.coldLeads} fríos</p>
      </div>
      <div style="padding:24px 28px;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Ventas confirmadas</p>
        <p style="margin:0;font-size:28px;font-weight:700;color:#16a34a;">${fmt(r.totalSales)}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">Tasa de conversión: ${convRate}</p>
      </div>
      <div style="padding:24px 28px;border-right:1px solid #e5e7eb;">
        <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Ingresos</p>
        <p style="margin:0;font-size:28px;font-weight:700;color:#d97706;">${r.totalRevenue !== null ? fmt(r.totalRevenue, r.primaryCurrency) : "N/D"}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">${r.primaryCurrency ?? "Moneda mixta"}</p>
      </div>
      <div style="padding:24px 28px;">
        <p style="margin:0 0 4px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">ROAS</p>
        <p style="margin:0;font-size:28px;font-weight:700;color:#7c3aed;">${r.roas !== null ? `${r.roas.toFixed(2)}×` : "N/D"}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">${r.totalSpend !== null ? `Gasto: ${fmt(r.totalSpend, r.primaryCurrency)}` : "Sin datos de gasto"}</p>
      </div>
    </div>

    ${r.campaigns.length > 0 ? `
    <!-- Campaign table -->
    <div style="padding:24px 28px 8px;">
      <p style="margin:0 0 16px;font-size:14px;font-weight:600;color:#111827;">Desglose por campaña</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:.05em;">Campaña</th>
            <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#6b7280;text-align:center;text-transform:uppercase;letter-spacing:.05em;">Leads</th>
            <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#6b7280;text-align:center;text-transform:uppercase;letter-spacing:.05em;">Ventas</th>
            <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#6b7280;text-align:center;text-transform:uppercase;letter-spacing:.05em;">Ingreso</th>
            <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#6b7280;text-align:center;text-transform:uppercase;letter-spacing:.05em;">ROAS</th>
          </tr>
        </thead>
        <tbody>${campaignRows}</tbody>
      </table>
    </div>
    ` : ""}

    <!-- CTA -->
    <div style="padding:28px 28px 32px;text-align:center;">
      <a href="${previewUrl}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">
        Ver reporte completo
      </a>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">Este reporte fue generado automáticamente por SyncLead.</p>
    </div>
  </div>
</body>
</html>`
}

export async function sendMonthlyReportEmail(opts: {
  to: string
  report: ReportData
  previewUrl: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) return

  const resend = new Resend(apiKey)
  const label = monthLabel(opts.report.from)
  const subject = `Reporte mensual ${label} — ${opts.report.clientName}`

  await resend.emails.send({
    from,
    to: opts.to,
    subject,
    html: buildHtml(opts.report, opts.previewUrl),
  })
}

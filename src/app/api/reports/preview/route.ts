import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { requireClientAccess } from "@/lib/auth/server"
import { AuthError, ForbiddenError, NotFoundError } from "@/lib/auth/errors"
import { getReportData } from "@/domains/analytics/reports"
import type { ReportData } from "@/domains/analytics/reports"

export const dynamic = "force-dynamic"

function parseMonth(month: string): { from: Date; to: Date } {
  const m = month.match(/^(\d{4})-(\d{2})$/)
  const now = new Date()
  if (!m) {
    return {
      from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
    }
  }
  const year = parseInt(m[1]), mon = parseInt(m[2]) - 1
  return {
    from: new Date(Date.UTC(year, mon, 1)),
    to: new Date(Date.UTC(year, mon + 1, 0, 23, 59, 59, 999)),
  }
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es", { month: "long", year: "numeric" })
}

function fmtN(n: number, currency?: string | null) {
  if (currency) return new Intl.NumberFormat("es", { style: "currency", currency, maximumFractionDigits: 2 }).format(n)
  return new Intl.NumberFormat("es").format(n)
}

function pct(n: number) { return `${n.toFixed(1)}%` }

function donutSvg(hot: number, warm: number, cold: number, total: number): string {
  if (total === 0) return ""
  const r = 42, circumference = 2 * Math.PI * r
  function arc(value: number, offsetPct: number) {
    const p = value / total
    return `stroke-dasharray="${(p * circumference).toFixed(2)} ${circumference.toFixed(2)}" stroke-dashoffset="${(-offsetPct * circumference).toFixed(2)}"`
  }
  const hotPct = hot / total, warmPct = warm / total
  return `<svg viewBox="0 0 100 100" width="120" height="120">
  <circle cx="50" cy="50" r="42" fill="none" stroke="#27272a" stroke-width="16"/>
  ${cold > 0 ? `<circle cx="50" cy="50" r="42" fill="none" stroke="#71717a" stroke-width="16" ${arc(cold, hotPct + warmPct)} transform="rotate(-90, 50, 50)"/>` : ""}
  ${warm > 0 ? `<circle cx="50" cy="50" r="42" fill="none" stroke="#f59e0b" stroke-width="16" ${arc(warm, hotPct)} transform="rotate(-90, 50, 50)"/>` : ""}
  ${hot > 0 ? `<circle cx="50" cy="50" r="42" fill="none" stroke="#ef4444" stroke-width="16" ${arc(hot, 0)} transform="rotate(-90, 50, 50)"/>` : ""}
  <text x="50" y="46" text-anchor="middle" font-size="14" font-weight="bold" fill="#f4f4f5">${total}</text>
  <text x="50" y="58" text-anchor="middle" font-size="7" fill="#a1a1aa">leads</text>
</svg>`
}

function sparklineSvg(data: { day: string; total: number }[]): string {
  if (data.length === 0) return ""
  const max = Math.max(...data.map(d => d.total), 1)
  const w = 300, h = 48
  const pts = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w
    const y = h - (d.total / max) * (h - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(" ")
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block">
  <polyline points="${pts}" fill="none" stroke="#3b6dff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
}

function buildHtml(data: ReportData, selectedMonth: string, appUrl: string): string {
  const convRate = data.totalLeads > 0 ? pct((data.totalSales / data.totalLeads) * 100) : "0%"
  const generatedAt = new Date().toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })
  const backUrl = `${appUrl}/dashboard/reports?clientId=${data.clientId}&month=${selectedMonth}`

  const hasSpend = data.campaigns.some(c => c.totalSpend !== null)

  const campaignRows = data.campaigns.map((c, i) => `
    <tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
      <td class="campaign-name">${escHtml(c.campaignName)}</td>
      <td class="num bold">${c.totalLeads}</td>
      <td class="num hot">${c.hotLeads}</td>
      <td class="num warm">${c.warmLeads}</td>
      <td class="num muted">${c.coldLeads}</td>
      <td class="num">${c.totalSales}</td>
      <td class="num">${c.totalRevenue !== null ? escHtml(fmtN(c.totalRevenue, c.currency)) : "—"}</td>
      ${hasSpend ? `<td class="num muted">${c.totalSpend !== null ? escHtml(fmtN(c.totalSpend, c.currency)) : "—"}</td><td class="num bold">${c.roas !== null ? `${c.roas.toFixed(2)}×` : "—"}</td>` : ""}
    </tr>`).join("")

  const kpiBoxes = [
    { label: "Leads captados", value: fmtN(data.totalLeads), accent: "blue" },
    { label: "Ventas confirmadas", value: fmtN(data.totalSales), accent: "green" },
    { label: "Tasa de conversión", value: convRate, accent: "blue" },
    { label: "Ingresos", value: data.totalRevenue !== null ? fmtN(data.totalRevenue, data.primaryCurrency) : "N/D", accent: "green" },
    ...(data.totalSpend !== null ? [{ label: "Gasto en ads", value: fmtN(data.totalSpend, data.primaryCurrency), accent: "amber" }] : []),
    ...(data.roas !== null ? [{ label: "ROAS", value: `${data.roas.toFixed(2)}×`, accent: "amber" }] : []),
  ].map(k => `<div class="kpi-box kpi-${k.accent}"><div class="kpi-label">${k.label}</div><div class="kpi-value">${escHtml(k.value)}</div></div>`).join("")

  const sparkline = data.leadsPerDay.length > 0
    ? `<div class="sparkline-wrap">${sparklineSvg(data.leadsPerDay)}<div class="sparkline-meta"><span>Pico: ${Math.max(...data.leadsPerDay.map(d => d.total))} leads/día</span><span>${data.leadsPerDay.length} días con actividad</span></div></div>`
    : `<p class="empty-note">Sin actividad en este periodo</p>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reporte ${escHtml(data.clientName)} — ${escHtml(monthLabel(selectedMonth))}</title>
  <style>${REPORT_CSS}</style>
</head>
<body>
  <div class="no-print" style="position:fixed;top:20px;right:24px;z-index:100;display:flex;gap:8px;">
    <a href="${escHtml(backUrl)}" class="btn-secondary">← Volver</a>
    <button onclick="window.print()" class="btn-primary">⬇ Descargar PDF</button>
  </div>

  <div class="page">
    <header class="report-header">
      <div class="header-brand">
        <div class="brand-logo">SL</div>
        <div>
          <div class="brand-name">SyncLead</div>
          <div class="brand-sub">Reporte de Campaña</div>
        </div>
      </div>
      <div class="header-meta">
        <div class="header-client">${escHtml(data.clientName)}</div>
        <div class="header-period">${escHtml(monthLabel(selectedMonth))}</div>
        <div class="header-generated">Generado el ${generatedAt}</div>
      </div>
    </header>

    <section class="section">
      <h2 class="section-title">Resumen del mes</h2>
      <div class="kpi-grid">${kpiBoxes}</div>
    </section>

    <section class="section two-col">
      <div class="card">
        <h3 class="card-title">Temperatura de leads</h3>
        ${data.totalLeads > 0 ? `
        <div class="temp-layout">
          ${donutSvg(data.hotLeads, data.warmLeads, data.coldLeads, data.totalLeads)}
          <div class="temp-legend">
            <div class="temp-row"><span class="temp-dot" style="background:#ef4444"></span><span class="temp-label">Calientes</span><span class="temp-val">${data.hotLeads}</span><span class="temp-pct">${pct(data.hotLeads / data.totalLeads * 100)}</span></div>
            <div class="temp-row"><span class="temp-dot" style="background:#f59e0b"></span><span class="temp-label">Tibios</span><span class="temp-val">${data.warmLeads}</span><span class="temp-pct">${pct(data.warmLeads / data.totalLeads * 100)}</span></div>
            <div class="temp-row"><span class="temp-dot" style="background:#71717a"></span><span class="temp-label">Fríos</span><span class="temp-val">${data.coldLeads}</span><span class="temp-pct">${pct(data.coldLeads / data.totalLeads * 100)}</span></div>
          </div>
        </div>` : `<p class="empty-note">Sin leads este periodo</p>`}
      </div>
      <div class="card">
        <h3 class="card-title">Leads por día</h3>
        ${sparkline}
      </div>
    </section>

    ${data.campaigns.length > 0 ? `
    <section class="section">
      <h2 class="section-title">Desglose por campaña</h2>
      <table class="report-table">
        <thead>
          <tr>
            <th>Campaña</th>
            <th class="num">Leads</th>
            <th class="num">Calientes</th>
            <th class="num">Tibios</th>
            <th class="num">Fríos</th>
            <th class="num">Ventas</th>
            <th class="num">Ingreso</th>
            ${hasSpend ? `<th class="num">Gasto</th><th class="num">ROAS</th>` : ""}
          </tr>
        </thead>
        <tbody>${campaignRows}</tbody>
        <tfoot>
          <tr class="total-row">
            <td>Total</td>
            <td class="num bold">${data.totalLeads}</td>
            <td class="num hot">${data.hotLeads}</td>
            <td class="num warm">${data.warmLeads}</td>
            <td class="num muted">${data.coldLeads}</td>
            <td class="num bold">${data.totalSales}</td>
            <td class="num bold">${data.totalRevenue !== null ? escHtml(fmtN(data.totalRevenue, data.primaryCurrency)) : "—"}</td>
            ${hasSpend ? `<td class="num muted">${data.totalSpend !== null ? escHtml(fmtN(data.totalSpend, data.primaryCurrency)) : "—"}</td><td class="num bold">${data.roas !== null ? `${data.roas.toFixed(2)}×` : "—"}</td>` : ""}
          </tr>
        </tfoot>
      </table>
    </section>` : ""}

    <footer class="report-footer">
      <span>SyncLead — Reporte generado automáticamente</span>
      <span>${escHtml(data.clientName)} · ${escHtml(monthLabel(selectedMonth))}</span>
    </footer>
  </div>
</body>
</html>`
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const clientId = url.searchParams.get("clientId")
  const month = url.searchParams.get("month") ?? ""

  if (!clientId) return new Response("Not found", { status: 404 })

  let ctx: { orgId: string; userId: string }
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) {
      return new Response(null, { status: 302, headers: { Location: "/login" } })
    }
    throw e
  }

  try {
    await requireClientAccess(clientId)
  } catch (e) {
    if (e instanceof NotFoundError) return new Response("Not found", { status: 404 })
    return new Response(null, { status: 302, headers: { Location: "/dashboard/clients" } })
  }

  const now = new Date()
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
  const selectedMonth = month || currentMonth
  const range = parseMonth(selectedMonth)
  const data = await getReportData(ctx.orgId, clientId, range.from, range.to)

  if (!data) return new Response("Not found", { status: 404 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const html = buildHtml(data, selectedMonth, appUrl)

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

const REPORT_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    background: #0f0f12; color: #f4f4f5; font-size: 14px; line-height: 1.5;
  }
  .page { max-width: 900px; margin: 0 auto; padding: 32px 24px 64px; }

  .report-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #27272a; }
  .header-brand { display: flex; align-items: center; gap: 12px; }
  .brand-logo { width: 48px; height: 48px; background: linear-gradient(135deg, #3b6dff, #6d4fff); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; color: #fff; letter-spacing: -1px; }
  .brand-name { font-size: 20px; font-weight: 700; color: #f4f4f5; }
  .brand-sub { font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 0.08em; }
  .header-meta { text-align: right; }
  .header-client { font-size: 22px; font-weight: 700; color: #f4f4f5; }
  .header-period { font-size: 14px; color: #a1a1aa; margin-top: 2px; text-transform: capitalize; }
  .header-generated { font-size: 11px; color: #52525b; margin-top: 6px; }

  .section { margin-bottom: 36px; }
  .section-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #27272a; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .kpi-box { border-radius: 12px; padding: 18px 20px; border: 1px solid #27272a; }
  .kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #71717a; margin-bottom: 8px; }
  .kpi-value { font-size: 28px; font-weight: 800; letter-spacing: -1px; }
  .kpi-blue { background: #0d1729; border-color: #1e3a5f; }
  .kpi-blue .kpi-value { color: #60a5fa; }
  .kpi-green { background: #0a1f17; border-color: #14532d; }
  .kpi-green .kpi-value { color: #4ade80; }
  .kpi-amber { background: #1c1305; border-color: #451a03; }
  .kpi-amber .kpi-value { color: #fbbf24; }

  .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; }
  .card-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: #71717a; margin-bottom: 16px; }

  .temp-layout { display: flex; align-items: center; gap: 20px; }
  .temp-legend { flex: 1; display: flex; flex-direction: column; gap: 10px; }
  .temp-row { display: flex; align-items: center; gap: 8px; }
  .temp-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .temp-label { flex: 1; font-size: 13px; color: #a1a1aa; }
  .temp-val { font-size: 18px; font-weight: 700; color: #f4f4f5; min-width: 32px; text-align: right; }
  .temp-pct { font-size: 11px; color: #52525b; min-width: 36px; text-align: right; }

  .sparkline-wrap { display: flex; flex-direction: column; gap: 10px; }
  .sparkline-meta { display: flex; justify-content: space-between; font-size: 11px; color: #52525b; }
  .empty-note { font-size: 12px; color: #52525b; padding: 16px 0; }

  .report-table { width: 100%; border-collapse: collapse; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; font-size: 13px; }
  .report-table th { background: #18181b; padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #71717a; border-bottom: 1px solid #27272a; }
  .report-table th.num { text-align: right; }
  .report-table td { padding: 10px 14px; border-bottom: 1px solid #1f1f23; }
  .row-even td { background: #18181b; }
  .row-odd td { background: #1a1a1e; }
  .report-table td.num { text-align: right; color: #a1a1aa; }
  .report-table td.bold { font-weight: 600; color: #f4f4f5; }
  .report-table td.hot { color: #f87171; }
  .report-table td.warm { color: #fbbf24; }
  .report-table td.muted { color: #52525b; }
  .campaign-name { font-weight: 500; color: #f4f4f5; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .total-row td { background: #0d0d10 !important; font-weight: 700; border-top: 2px solid #27272a; color: #f4f4f5; font-size: 13px; }

  .report-footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #27272a; display: flex; justify-content: space-between; font-size: 11px; color: #52525b; }

  .btn-primary { background: linear-gradient(135deg, #3b6dff, #6d4fff); color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 12px rgba(59,109,255,0.4); transition: transform 0.1s; }
  .btn-primary:hover { transform: scale(1.03); }
  .btn-secondary { background: #27272a; color: #a1a1aa; border: 1px solid #3f3f46; border-radius: 8px; padding: 10px 16px; font-size: 13px; text-decoration: none; cursor: pointer; }
  .btn-secondary:hover { color: #f4f4f5; }

  @page { size: A4 portrait; margin: 1.5cm 1.5cm 2cm; }
  @media print {
    html, body { background: #ffffff !important; color: #1a1a1a !important; font-size: 12px; }
    .no-print { display: none !important; }
    .page { max-width: 100%; padding: 0; }
    .report-header { border-bottom-color: #e4e4e7; }
    .brand-logo { background: #3b6dff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .brand-name, .header-client { color: #111 !important; }
    .brand-sub, .header-period, .header-generated { color: #666 !important; }
    .section-title { color: #555 !important; border-bottom-color: #e4e4e7; }
    .kpi-box { border-color: #e4e4e7 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .kpi-blue { background: #eff6ff !important; border-color: #bfdbfe !important; }
    .kpi-blue .kpi-value { color: #1d4ed8 !important; }
    .kpi-green { background: #f0fdf4 !important; border-color: #bbf7d0 !important; }
    .kpi-green .kpi-value { color: #16a34a !important; }
    .kpi-amber { background: #fffbeb !important; border-color: #fde68a !important; }
    .kpi-amber .kpi-value { color: #d97706 !important; }
    .card { background: #f9f9fb !important; border-color: #e4e4e7 !important; }
    .card-title { color: #555 !important; }
    .temp-label, .temp-pct { color: #555 !important; }
    .temp-val { color: #111 !important; }
    .report-table { border-color: #e4e4e7; }
    .report-table th { background: #f4f4f5 !important; color: #555 !important; border-bottom-color: #e4e4e7; }
    .row-even td { background: #ffffff !important; }
    .row-odd td { background: #fafafa !important; }
    .report-table td { border-bottom-color: #f0f0f0; }
    .report-table td.num { color: #444 !important; }
    .report-table td.bold, .campaign-name { color: #111 !important; }
    .report-table td.hot { color: #dc2626 !important; }
    .report-table td.warm { color: #d97706 !important; }
    .report-table td.muted { color: #9ca3af !important; }
    .total-row td { background: #f0f0f0 !important; color: #111 !important; }
    .report-footer { border-top-color: #e4e4e7; color: #9ca3af !important; }
    .sparkline-meta { color: #9ca3af !important; }
    .empty-note { color: #9ca3af !important; }
  }
`

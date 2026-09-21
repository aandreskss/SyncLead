import { redirect, notFound } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { requireClientAccess } from "@/lib/auth/server"
import { NotFoundError } from "@/lib/auth/errors"
import { getReportData } from "@/domains/analytics/reports"
import type { ReportData, CampaignReportRow } from "@/domains/analytics/reports"

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
  if (currency) {
    return new Intl.NumberFormat("es", { style: "currency", currency, maximumFractionDigits: 2 }).format(n)
  }
  return new Intl.NumberFormat("es").format(n)
}

function pct(n: number) { return `${n.toFixed(1)}%` }

// SVG donut chart (static, no JS needed)
function DonutChart({ hot, warm, cold, total }: { hot: number; warm: number; cold: number; total: number }) {
  if (total === 0) return null
  const r = 42, cx = 50, cy = 50, stroke = 16
  const circumference = 2 * Math.PI * r

  function arc(value: number, offset: number) {
    const pct = value / total
    return { strokeDasharray: `${pct * circumference} ${circumference}`, strokeDashoffset: -offset * circumference }
  }

  const hotPct = hot / total, warmPct = warm / total
  const hotArc = arc(hot, 0)
  const warmArc = arc(warm, hotPct)
  const coldArc = arc(cold, hotPct + warmPct)

  return (
    <svg viewBox="0 0 100 100" width="120" height="120">
      {/* Background */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#27272a" strokeWidth={stroke} />
      {cold > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#71717a" strokeWidth={stroke}
          strokeDasharray={coldArc.strokeDasharray}
          strokeDashoffset={coldArc.strokeDashoffset}
          transform="rotate(-90, 50, 50)" />
      )}
      {warm > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f59e0b" strokeWidth={stroke}
          strokeDasharray={warmArc.strokeDasharray}
          strokeDashoffset={warmArc.strokeDashoffset}
          transform="rotate(-90, 50, 50)" />
      )}
      {hot > 0 && (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ef4444" strokeWidth={stroke}
          strokeDasharray={hotArc.strokeDasharray}
          strokeDashoffset={hotArc.strokeDashoffset}
          transform="rotate(-90, 50, 50)" />
      )}
      <text x="50" y="46" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#f4f4f5">{total}</text>
      <text x="50" y="58" textAnchor="middle" fontSize="7" fill="#a1a1aa">leads</text>
    </svg>
  )
}

// Mini sparkline for leads per day
function Sparkline({ data }: { data: { day: string; total: number }[] }) {
  if (data.length === 0) return null
  const max = Math.max(...data.map(d => d.total), 1)
  const w = 300, h = 48
  const pts = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w
    const y = h - (d.total / max) * (h - 4) - 2
    return `${x},${y}`
  }).join(" ")

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ display: "block" }}>
      <polyline
        points={pts}
        fill="none"
        stroke="#3b6dff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default async function ReportPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; month?: string }>
}) {
  const sp = await searchParams
  const { clientId, month = "" } = sp

  if (!clientId) notFound()

  let ctx: { orgId: string; userId: string }
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  try {
    await requireClientAccess(clientId)
  } catch (e) {
    if (e instanceof NotFoundError) notFound()
    redirect("/dashboard/clients")
  }

  const now = new Date()
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
  const selectedMonth = month || currentMonth
  const range = parseMonth(selectedMonth)
  const data = await getReportData(ctx.orgId, clientId, range.from, range.to)

  if (!data) notFound()

  const generatedAt = new Date().toLocaleDateString("es", {
    day: "numeric", month: "long", year: "numeric",
  })

  const convRate = data.totalLeads > 0
    ? pct((data.totalSales / data.totalLeads) * 100)
    : "0%"

  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Reporte {data.clientName} — {monthLabel(selectedMonth)}</title>
        <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />
      </head>
      <body>
        {/* Print button (hidden in print) */}
        <div className="no-print" style={{ position: "fixed", top: 20, right: 24, zIndex: 100, display: "flex", gap: 8 }}>
          <a href="/dashboard/reports" className="btn-secondary">← Volver</a>
          <button onClick={() => {}} id="print-btn" className="btn-primary">⬇ Descargar PDF</button>
        </div>
        <script dangerouslySetInnerHTML={{ __html: `document.getElementById('print-btn').onclick=function(){window.print()}` }} />

        <div className="page">
          {/* Header */}
          <header className="report-header">
            <div className="header-brand">
              <div className="brand-logo">SL</div>
              <div>
                <div className="brand-name">SyncLead</div>
                <div className="brand-sub">Reporte de Campaña</div>
              </div>
            </div>
            <div className="header-meta">
              <div className="header-client">{data.clientName}</div>
              <div className="header-period">{monthLabel(selectedMonth)}</div>
              <div className="header-generated">Generado el {generatedAt}</div>
            </div>
          </header>

          {/* KPI Summary */}
          <section className="section">
            <h2 className="section-title">Resumen del mes</h2>
            <div className="kpi-grid">
              <KpiBox label="Leads captados" value={fmtN(data.totalLeads)} accent="blue" />
              <KpiBox label="Ventas confirmadas" value={fmtN(data.totalSales)} accent="green" />
              <KpiBox label="Tasa de conversión" value={convRate} accent="blue" />
              <KpiBox
                label="Ingresos"
                value={data.totalRevenue !== null ? fmtN(data.totalRevenue, data.primaryCurrency) : "N/D"}
                accent="green"
              />
              {data.totalSpend !== null && (
                <KpiBox
                  label="Gasto en ads"
                  value={fmtN(data.totalSpend, data.primaryCurrency)}
                  accent="amber"
                />
              )}
              {data.roas !== null && (
                <KpiBox label="ROAS" value={`${data.roas.toFixed(2)}×`} accent="amber" />
              )}
            </div>
          </section>

          {/* Temperature + Sparkline */}
          <section className="section two-col">
            <div className="card">
              <h3 className="card-title">Temperatura de leads</h3>
              <div className="temp-layout">
                <DonutChart hot={data.hotLeads} warm={data.warmLeads} cold={data.coldLeads} total={data.totalLeads} />
                <div className="temp-legend">
                  <div className="temp-row">
                    <span className="temp-dot" style={{ background: "#ef4444" }} />
                    <span className="temp-label">Calientes</span>
                    <span className="temp-val">{data.hotLeads}</span>
                    <span className="temp-pct">{data.totalLeads > 0 ? pct(data.hotLeads / data.totalLeads * 100) : "—"}</span>
                  </div>
                  <div className="temp-row">
                    <span className="temp-dot" style={{ background: "#f59e0b" }} />
                    <span className="temp-label">Tibios</span>
                    <span className="temp-val">{data.warmLeads}</span>
                    <span className="temp-pct">{data.totalLeads > 0 ? pct(data.warmLeads / data.totalLeads * 100) : "—"}</span>
                  </div>
                  <div className="temp-row">
                    <span className="temp-dot" style={{ background: "#71717a" }} />
                    <span className="temp-label">Fríos</span>
                    <span className="temp-val">{data.coldLeads}</span>
                    <span className="temp-pct">{data.totalLeads > 0 ? pct(data.coldLeads / data.totalLeads * 100) : "—"}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="card">
              <h3 className="card-title">Leads por día</h3>
              {data.leadsPerDay.length > 0 ? (
                <div className="sparkline-wrap">
                  <Sparkline data={data.leadsPerDay} />
                  <div className="sparkline-meta">
                    <span>Pico: {Math.max(...data.leadsPerDay.map(d => d.total))} leads/día</span>
                    <span>{data.leadsPerDay.length} días con actividad</span>
                  </div>
                </div>
              ) : (
                <p className="empty-note">Sin actividad en este periodo</p>
              )}
            </div>
          </section>

          {/* Campaign breakdown */}
          {data.campaigns.length > 0 && (
            <section className="section">
              <h2 className="section-title">Desglose por campaña</h2>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Campaña</th>
                    <th className="num">Leads</th>
                    <th className="num">Calientes</th>
                    <th className="num">Tibios</th>
                    <th className="num">Fríos</th>
                    <th className="num">Ventas</th>
                    <th className="num">Ingreso</th>
                    {data.campaigns.some(c => c.totalSpend !== null) && (
                      <>
                        <th className="num">Gasto</th>
                        <th className="num">ROAS</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((c, i) => (
                    <tr key={c.campaignId} className={i % 2 === 0 ? "row-even" : "row-odd"}>
                      <td className="campaign-name">{c.campaignName}</td>
                      <td className="num bold">{c.totalLeads}</td>
                      <td className="num hot">{c.hotLeads}</td>
                      <td className="num warm">{c.warmLeads}</td>
                      <td className="num muted">{c.coldLeads}</td>
                      <td className="num">{c.totalSales}</td>
                      <td className="num">{c.totalRevenue !== null ? fmtN(c.totalRevenue, c.currency) : "—"}</td>
                      {data.campaigns.some(x => x.totalSpend !== null) && (
                        <>
                          <td className="num muted">{c.totalSpend !== null ? fmtN(c.totalSpend, c.currency) : "—"}</td>
                          <td className="num bold">{c.roas !== null ? `${c.roas.toFixed(2)}×` : "—"}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="total-row">
                    <td>Total</td>
                    <td className="num bold">{data.totalLeads}</td>
                    <td className="num hot">{data.hotLeads}</td>
                    <td className="num warm">{data.warmLeads}</td>
                    <td className="num muted">{data.coldLeads}</td>
                    <td className="num bold">{data.totalSales}</td>
                    <td className="num bold">{data.totalRevenue !== null ? fmtN(data.totalRevenue, data.primaryCurrency) : "—"}</td>
                    {data.campaigns.some(c => c.totalSpend !== null) && (
                      <>
                        <td className="num muted">{data.totalSpend !== null ? fmtN(data.totalSpend, data.primaryCurrency) : "—"}</td>
                        <td className="num bold">{data.roas !== null ? `${data.roas.toFixed(2)}×` : "—"}</td>
                      </>
                    )}
                  </tr>
                </tfoot>
              </table>
            </section>
          )}

          {/* Footer */}
          <footer className="report-footer">
            <span>SyncLead — Reporte generado automáticamente</span>
            <span>{data.clientName} · {monthLabel(selectedMonth)}</span>
          </footer>
        </div>
      </body>
    </html>
  )
}

function KpiBox({ label, value, accent }: { label: string; value: string; accent: "blue" | "green" | "amber" }) {
  return (
    <div className={`kpi-box kpi-${accent}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  )
}

const REPORT_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    background: #0f0f12;
    color: #f4f4f5;
    font-size: 14px;
    line-height: 1.5;
  }

  .page {
    max-width: 900px;
    margin: 0 auto;
    padding: 32px 24px 64px;
  }

  /* Header */
  .report-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 40px;
    padding-bottom: 24px;
    border-bottom: 2px solid #27272a;
  }
  .header-brand { display: flex; align-items: center; gap: 12px; }
  .brand-logo {
    width: 48px; height: 48px;
    background: linear-gradient(135deg, #3b6dff, #6d4fff);
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 18px; color: #fff; letter-spacing: -1px;
  }
  .brand-name { font-size: 20px; font-weight: 700; color: #f4f4f5; }
  .brand-sub { font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 0.08em; }
  .header-meta { text-align: right; }
  .header-client { font-size: 22px; font-weight: 700; color: #f4f4f5; }
  .header-period { font-size: 14px; color: #a1a1aa; margin-top: 2px; text-transform: capitalize; }
  .header-generated { font-size: 11px; color: #52525b; margin-top: 6px; }

  /* Sections */
  .section { margin-bottom: 36px; }
  .section-title {
    font-size: 13px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.08em; color: #71717a; margin-bottom: 14px;
    padding-bottom: 8px; border-bottom: 1px solid #27272a;
  }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  /* KPI grid */
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .kpi-box {
    border-radius: 12px; padding: 18px 20px;
    border: 1px solid #27272a;
  }
  .kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #71717a; margin-bottom: 8px; }
  .kpi-value { font-size: 28px; font-weight: 800; letter-spacing: -1px; }
  .kpi-blue { background: #0d1729; border-color: #1e3a5f; }
  .kpi-blue .kpi-value { color: #60a5fa; }
  .kpi-green { background: #0a1f17; border-color: #14532d; }
  .kpi-green .kpi-value { color: #4ade80; }
  .kpi-amber { background: #1c1305; border-color: #451a03; }
  .kpi-amber .kpi-value { color: #fbbf24; }

  /* Cards */
  .card {
    background: #18181b; border: 1px solid #27272a;
    border-radius: 12px; padding: 20px;
  }
  .card-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: #71717a; margin-bottom: 16px; }

  /* Temperature */
  .temp-layout { display: flex; align-items: center; gap: 20px; }
  .temp-legend { flex: 1; display: flex; flex-direction: column; gap: 10px; }
  .temp-row { display: flex; align-items: center; gap: 8px; }
  .temp-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .temp-label { flex: 1; font-size: 13px; color: #a1a1aa; }
  .temp-val { font-size: 18px; font-weight: 700; color: #f4f4f5; min-width: 32px; text-align: right; }
  .temp-pct { font-size: 11px; color: #52525b; min-width: 36px; text-align: right; }

  /* Sparkline */
  .sparkline-wrap { display: flex; flex-direction: column; gap: 10px; }
  .sparkline-meta { display: flex; justify-content: space-between; font-size: 11px; color: #52525b; }
  .empty-note { font-size: 12px; color: #52525b; padding: 16px 0; }

  /* Table */
  .report-table {
    width: 100%; border-collapse: collapse;
    border: 1px solid #27272a; border-radius: 12px; overflow: hidden;
    font-size: 13px;
  }
  .report-table th {
    background: #18181b; padding: 10px 14px;
    text-align: left; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em; color: #71717a;
    border-bottom: 1px solid #27272a;
  }
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
  .total-row td {
    background: #0d0d10 !important; font-weight: 700;
    border-top: 2px solid #27272a; color: #f4f4f5; font-size: 13px;
  }

  /* Footer */
  .report-footer {
    margin-top: 48px; padding-top: 20px;
    border-top: 1px solid #27272a;
    display: flex; justify-content: space-between;
    font-size: 11px; color: #52525b;
  }

  /* Print button */
  .btn-primary {
    background: linear-gradient(135deg, #3b6dff, #6d4fff);
    color: #fff; border: none; border-radius: 8px;
    padding: 10px 20px; font-size: 13px; font-weight: 600;
    cursor: pointer; box-shadow: 0 2px 12px rgba(59,109,255,0.4);
    transition: transform 0.1s;
  }
  .btn-primary:hover { transform: scale(1.03); }
  .btn-secondary {
    background: #27272a; color: #a1a1aa; border: 1px solid #3f3f46;
    border-radius: 8px; padding: 10px 16px; font-size: 13px;
    text-decoration: none; cursor: pointer;
  }
  .btn-secondary:hover { color: #f4f4f5; }

  /* ─── Print styles ─────────────────────────────────────────── */
  @page {
    size: A4 portrait;
    margin: 1.5cm 1.5cm 2cm;
  }

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

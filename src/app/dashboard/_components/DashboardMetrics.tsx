import Link from "next/link"
import { ChartColumn } from "lucide-react"
import {
  getKPIMetrics,
  getLeadsByDay,
  getLeadsByUtmContent,
  getLeadsByPlatform,
  getLeadsByDevice,
  getLeadsByBrowser,
  getTopCities,
  getLeadsByTemperatureDay,
  getPerformanceTable,
  type LeadsByDayRow,
} from "@/domains/analytics/repository"
import { getCampaignsWithClientAndCounts } from "@/domains/campaigns/repository"
import { KPIStrip } from "./KPIStrip"
import { PerformanceChart, type DayPoint } from "./PerformanceChart"
import { SummaryPanel, type Insight } from "./SummaryPanel"
import { CampaignTable, type CampaignRow } from "./CampaignTable"
import { QualityPanel, type QualityCheck } from "./QualityPanel"
import { fmt, longDay } from "./format"

interface Props {
  orgId: string
  from: Date
  to: Date
  prevFrom: Date
  prevTo: Date
  clientId?: string
  isAdmin: boolean
}

const pad = (n: number) => String(n).padStart(2, "0")
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function eachDay(from: Date, to: Date): string[] {
  const out: string[] = []
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  while (d <= end && out.length < 400) {
    out.push(dayKey(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** Serie continua (los días sin actividad valen 0) con el periodo anterior alineado por posición. */
function buildDays(from: Date, to: Date, prevFrom: Date, prevTo: Date, cur: LeadsByDayRow[], prev: LeadsByDayRow[]): DayPoint[] {
  const curMap = new Map(cur.map((r) => [r.day, r]))
  const prevMap = new Map(prev.map((r) => [r.day, r]))
  const curDays = eachDay(from, to)
  const prevDays = eachDay(prevFrom, prevTo)
  const days = new Set(curDays)
  const extra = cur.map((r) => r.day).filter((d) => !days.has(d))
  const hasPrev = prev.length > 0
  const points: DayPoint[] = curDays.map((day, i) => ({
    day,
    total: curMap.get(day)?.total ?? 0,
    converted: curMap.get(day)?.converted ?? 0,
    prevTotal: hasPrev ? (prevMap.get(prevDays[i] ?? "")?.total ?? 0) : undefined,
  }))
  for (const day of extra) points.push({ day, total: curMap.get(day)!.total, converted: curMap.get(day)!.converted })
  return points.sort((a, b) => a.day.localeCompare(b.day))
}

export async function DashboardMetrics({ orgId, from, to, prevFrom, prevTo, clientId, isAdmin }: Props) {
  const [current, prev, byDay, prevByDay, perf, campaigns, byUtm, byPlatform, byDevice, byBrowser, byCities, byTempDay] = await Promise.all([
    getKPIMetrics(orgId, from, to, clientId),
    getKPIMetrics(orgId, prevFrom, prevTo, clientId),
    getLeadsByDay(orgId, from, to, clientId),
    getLeadsByDay(orgId, prevFrom, prevTo, clientId),
    getPerformanceTable(orgId, from, to, clientId),
    getCampaignsWithClientAndCounts(orgId),
    getLeadsByUtmContent(orgId, from, to, clientId),
    getLeadsByPlatform(orgId, from, to, clientId),
    getLeadsByDevice(orgId, from, to, clientId),
    getLeadsByBrowser(orgId, from, to, clientId),
    getTopCities(orgId, from, to, clientId),
    getLeadsByTemperatureDay(orgId, from, to, clientId),
  ])

  const totalLeads = current.totalLeads
  const days = buildDays(from, to, prevFrom, prevTo, byDay, prevByDay)
  const activeDays = days.filter((d) => d.total > 0 || d.converted > 0)

  let note: string | undefined
  if (days.length > 7 && activeDays.length === 1) {
    note = `Actividad concentrada el ${longDay(activeDays[0].day)}. Sin leads ni ventas en el resto del periodo.`
  } else if (days.length > 14 && activeDays.length >= 2 && activeDays.length <= 3) {
    note = `Actividad concentrada en ${activeDays.length} días, entre el ${longDay(activeDays[0].day)} y el ${longDay(activeDays[activeDays.length - 1].day)}.`
  }

  // ── Tabla de campañas (agrupa anuncios por campaña) ──
  const activeMap = new Map(campaigns.map((c) => [c.id, c.active]))
  const grouped = new Map<string, CampaignRow>()
  for (const r of perf) {
    const g = grouped.get(r.campaignId) ?? {
      id: r.campaignId,
      name: r.campaignName,
      active: activeMap.get(r.campaignId) ?? null,
      leads: 0,
      sales: 0,
      conv: null,
      revenue: 0,
    }
    g.leads += r.totalLeads
    g.sales += r.totalSales
    g.revenue += r.totalRevenue
    grouped.set(r.campaignId, g)
  }
  const allRows = [...grouped.values()].map((g) => ({ ...g, conv: g.leads > 0 ? (g.sales / g.leads) * 100 : null }))
  allRows.sort((a, b) => b.sales - a.sales || b.leads - a.leads)
  const tableRows = allRows.slice(0, 8)

  // ── Temperatura ──
  const temp = byTempDay.reduce((a, r) => ({ hot: a.hot + r.hot, warm: a.warm + r.warm, cold: a.cold + r.cold }), { hot: 0, warm: 0, cold: 0 })

  // ── Calidad de atribución ──
  const share = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  const devTotal = byDevice.reduce((a, r) => a + r.total, 0)
  const devUnknown = byDevice.find((r) => r.device === "Desconocido")?.total ?? 0
  const platTotal = byPlatform.reduce((a, r) => a + r.total, 0)
  const platTop = byPlatform[0]
  const cityKnown = byCities.filter((r) => r.city !== "Desconocida")
  const cityKnownN = cityKnown.reduce((a, r) => a + r.total, 0)
  const utmKnown = byUtm.filter((r) => r.utmContent !== "(sin anuncio)")
  const utmKnownN = utmKnown.reduce((a, r) => a + r.total, 0)
  const utmTotal = byUtm.reduce((a, r) => a + r.total, 0)

  const browTotal = byBrowser.reduce((a, r) => a + r.total, 0)
  const browTop = byBrowser.find((r) => r.browser !== "Desconocido")
  const browUnknown = byBrowser.find((r) => r.browser === "Desconocido")?.total ?? 0

  const checks: QualityCheck[] = [
    !platTop
      ? { label: "Plataforma", value: "Sin datos", status: "unknown" }
      : platTop.platform === "Directo" && share(platTop.total, platTotal) >= 50
        ? { label: "Plataforma", value: `Directo · ${share(platTop.total, platTotal)} %`, status: "warn" }
        : { label: "Plataforma", value: `${platTop.platform} · ${share(platTop.total, platTotal)} %`, status: "ok" },
    devTotal === 0
      ? { label: "Dispositivo", value: "Sin datos", status: "unknown" }
      : share(devUnknown, devTotal) >= 50
        ? { label: "Dispositivo", value: `Desconocido · ${share(devUnknown, devTotal)} %`, status: "bad" }
        : { label: "Dispositivo", value: `${byDevice[0].device} · ${share(byDevice[0].total, devTotal)} %`, status: "ok" },
    browTotal === 0 || !browTop
      ? { label: "Navegador", value: "Sin datos", status: "unknown" }
      : share(browUnknown, browTotal) >= 50
        ? { label: "Navegador", value: `Desconocido · ${share(browUnknown, browTotal)} %`, status: "bad" }
        : { label: "Navegador", value: `${browTop.browser} · ${share(browTop.total, browTotal)} %`, status: "ok" },
    totalLeads < 5 || cityKnownN / Math.max(totalLeads, 1) < 0.5
      ? { label: "Ciudad", value: "Sin datos suficientes", status: "unknown" }
      : { label: "Ciudad", value: `${cityKnown[0].city} · ${share(cityKnown[0].total, totalLeads)} %`, status: "ok" },
    totalLeads < 5 || utmKnownN / Math.max(utmTotal, 1) < 0.5
      ? { label: "UTM content", value: "Sin desglose confiable", status: "unknown" }
      : { label: "UTM content", value: `${fmt(utmKnown.length)} ${utmKnown.length === 1 ? "anuncio identificado" : "anuncios identificados"}`, status: "ok" },
  ]

  // ── Observaciones accionables ──
  const insights: Insight[] = []
  if (totalLeads === 0) {
    insights.push({ text: "Aún no hay leads en este periodo.", hint: "Amplía el periodo o revisa que las campañas estén enviando leads." })
  } else {
    if (devTotal > 0 && share(devUnknown, devTotal) >= 50) {
      insights.push({ text: `El ${share(devUnknown, devTotal)} % de los dispositivos aparece como desconocido.`, hint: "Afecta la lectura por dispositivo." })
    }
    const directShare = platTop?.platform === "Directo" ? share(platTop.total, platTotal) : 0
    const noAdShare = utmTotal > 0 ? 100 - share(utmKnownN, utmTotal) : 0
    if (directShare >= 80 || noAdShare >= 80) {
      insights.push({ text: "Faltan datos de atribución para identificar los canales con mayor rendimiento.", hint: "Afecta la comparación de canales." })
    }
    if (insights.length === 0) insights.push({ ok: true, text: "Sin incidencias de tracking en este periodo." })
  }

  const trackingHref = isAdmin ? "/dashboard/health" : "/dashboard/clients"
  const empty = totalLeads === 0 && current.totalSales === 0

  return (
    <div className="space-y-5">
      <KPIStrip current={current} prev={prev} series={days.slice(-30)} />

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          {empty ? (
            <section aria-label="Rendimiento del periodo" className="h-full rounded-lg border border-ops-line bg-ops-s1 p-5">
              <h2 className="text-base font-semibold text-ops-tx">Rendimiento del periodo</h2>
              <div className="mt-4 flex items-start gap-4">
                <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#16213a] text-ops-blue-t">
                  <ChartColumn className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ops-tx">No hay actividad en este periodo</p>
                  <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ops-tx2">
                    Cuando entren leads o se registren ventas verás aquí su evolución diaria. Prueba con un periodo más amplio o importa leads existentes.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Link href="/dashboard/campaigns" className="inline-flex h-9 items-center rounded-lg bg-ops-blue px-3.5 text-[13px] font-semibold text-ops-bg transition-opacity duration-150 hover:opacity-90">
                      Ir a campañas
                    </Link>
                    <Link href="/dashboard/import" className="inline-flex h-9 items-center rounded-lg border border-ops-bd px-3.5 text-[13px] font-medium text-ops-tx transition-colors duration-150 hover:border-ops-bd2 hover:bg-ops-raised">
                      Importar leads
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <PerformanceChart days={days} totalLeads={totalLeads} totalSales={current.totalSales} hasPrev={prevByDay.length > 0} note={note} />
          )}
        </div>
        <div className="min-w-0 lg:col-span-4">
          <SummaryPanel
            leads={totalLeads}
            sales={current.totalSales}
            conversionRate={current.conversionRate}
            avgTicket={current.avgTicket}
            insights={insights}
            trackingHref={trackingHref}
          />
        </div>
      </div>

      <CampaignTable rows={tableRows} total={allRows.length} />
      <QualityPanel temp={temp} checks={checks} totalLeads={totalLeads} diagnosticHref={trackingHref} />
    </div>
  )
}

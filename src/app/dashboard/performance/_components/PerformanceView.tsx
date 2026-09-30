"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { ArrowUpDown, ArrowUp, ArrowDown, Download, Search, X, Zap } from "lucide-react"
import type { PerformanceRow, Metric } from "@/domains/analytics/types"
import { logCsvExportAction } from "@/domains/analytics/actions"

interface Props {
  rows: PerformanceRow[]
  prevRows: PerformanceRow[]
}

type SortKey = keyof PerformanceRow | "cpl" | "cpa" | "roas"
type SortDir = "asc" | "desc"
type Level = "campaign" | "adset" | "ad"

const LEVELS: { value: Level; label: string }[] = [
  { value: "campaign", label: "Campaña" },
  { value: "adset", label: "Conjunto" },
  { value: "ad", label: "Anuncio" },
]

function levelKey(r: PerformanceRow, level: Level): string {
  if (level === "campaign") return r.campaignId
  if (level === "adset") return `${r.campaignId}||${r.metaAdsetName}`
  return `${r.campaignId}||${r.metaAdsetName}||${r.utmContent}`
}

function aggregate(rows: PerformanceRow[], level: Level): PerformanceRow[] {
  if (level === "ad") return rows
  const map = new Map<string, PerformanceRow>()
  for (const r of rows) {
    const k = levelKey(r, level)
    const cur = map.get(k)
    if (!cur) {
      map.set(k, {
        ...r,
        metaAdsetName: level === "campaign" ? "" : r.metaAdsetName,
        utmContent: "",
        spend: r.spend,
        currency: r.currency,
      })
    } else {
      cur.totalLeads += r.totalLeads
      cur.totalSales += r.totalSales
      cur.totalRevenue += r.totalRevenue
      if (r.spend !== null) cur.spend = (cur.spend ?? 0) + r.spend
      if (r.currency !== cur.currency) cur.currency = null
    }
  }
  const out = [...map.values()]
  for (const o of out) o.convRate = o.totalLeads > 0 ? (o.totalSales / o.totalLeads) * 100 : null
  return out
}

function buildPrevMap(prevRows: PerformanceRow[], level: Level): Record<string, PerformanceRow> {
  const map: Record<string, PerformanceRow> = {}
  for (const r of aggregate(prevRows, level)) map[levelKey(r, level)] = r
  return map
}

function delta(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null) return null
  if (prev === 0 && curr === 0) return null
  if (prev === 0) return curr > 0 ? 100 : 0
  return ((curr - prev) / prev) * 100
}

function DeltaBadge({ curr, prev }: { curr: number | null; prev: number | null }) {
  const pct = delta(curr, prev)
  if (pct === null) return null
  const abs = Math.abs(pct)
  if (abs < 0.5)
    return <span className="ml-1 inline-flex items-center rounded px-1 py-px text-[10px] font-medium bg-ops-s2 text-ops-tx3">→</span>
  if (pct > 0)
    return <span className="ml-1 inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold bg-ops-green/10 text-ops-green whitespace-nowrap">▲{abs.toFixed(0)}%</span>
  return <span className="ml-1 inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold bg-ops-coral/10 text-ops-coral whitespace-nowrap">▼{abs.toFixed(0)}%</span>
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="h-3 w-3 opacity-30" />
  return sortDir === "desc"
    ? <ArrowDown className="h-3 w-3 text-ops-blue" />
    : <ArrowUp className="h-3 w-3 text-ops-blue" />
}

function sanitizeCsv(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

function fmtMetric(m: Metric, suffix = ""): string {
  return m === null ? "N/D" : `${m.toFixed(2)}${suffix}`
}

function calcCPL(spend: number | null, leads: number): number | null {
  if (spend === null || spend <= 0 || leads <= 0) return null
  return spend / leads
}

function calcCPA(spend: number | null, sales: number): number | null {
  if (spend === null || spend <= 0 || sales <= 0) return null
  return spend / sales
}

function calcROAS(revenue: number, spend: number | null): number | null {
  if (spend === null || spend <= 0) return null
  return revenue / spend
}

function fmtMoney(n: number | null, currency?: string | null): string {
  if (n === null) return "—"
  const cur = currency ?? "USD"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ${cur}`
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k ${cur}`
  return n.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + cur
}

function fmtRevenue(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtROAS(n: number | null): string {
  if (n === null) return "—"
  return `${n.toFixed(2)}x`
}

function roasColor(roas: number | null): string {
  if (roas === null) return "text-ops-tx3"
  if (roas >= 2) return "text-ops-green"
  if (roas >= 1) return "text-ops-amber"
  return "text-ops-coral"
}

function roasBg(roas: number | null): string {
  if (roas === null) return ""
  if (roas >= 2) return "bg-ops-green/10"
  if (roas >= 1) return "bg-ops-amber/10"
  return "bg-ops-coral/10"
}

async function exportCSV(rows: PerformanceRow[]) {
  const header = "Campaña,ID Campaña,Conjunto de anuncios,Anuncio,Leads,Ventas,Conversión %,Ingresos,Gasto Meta,CPL,CPA,ROAS"
  const lines = rows.map((r) => {
    const cpl = calcCPL(r.spend, r.totalLeads)
    const cpa = calcCPA(r.spend, r.totalSales)
    const roas = calcROAS(r.totalRevenue, r.spend)
    return [
      `"${sanitizeCsv(r.campaignName)}"`,
      `"${r.campaignId}"`,
      `"${sanitizeCsv(r.metaAdsetName)}"`,
      `"${sanitizeCsv(r.utmContent)}"`,
      r.totalLeads,
      r.totalSales,
      `"${fmtMetric(r.convRate, "%")}"`,
      r.totalRevenue.toFixed(2),
      r.spend !== null ? r.spend.toFixed(2) : "",
      cpl !== null ? cpl.toFixed(2) : "",
      cpa !== null ? cpa.toFixed(2) : "",
      roas !== null ? roas.toFixed(2) : "",
    ].join(",")
  })
  const csv = [header, ...lines].join("\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `rendimiento_${new Date().toISOString().split("T")[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
  void logCsvExportAction("rendimiento", rows.length)
}

function getRowValue(row: PerformanceRow, key: SortKey): number | string | null {
  if (key === "cpl") return calcCPL(row.spend, row.totalLeads)
  if (key === "cpa") return calcCPA(row.spend, row.totalSales)
  if (key === "roas") return calcROAS(row.totalRevenue, row.spend)
  return row[key as keyof PerformanceRow] as number | string | null
}

const TH = "h-9 border-b border-ops-line bg-ops-side px-3 text-[11px] font-semibold uppercase tracking-wide text-ops-tx3 whitespace-nowrap"

export function PerformanceView({ rows: rawRows, prevRows: rawPrev }: Props) {
  const [level, setLevel] = useState<Level>("ad")
  const [sortKey, setSortKey] = useState<SortKey>("totalLeads")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [search, setSearch] = useState("")

  const rows = aggregate(rawRows, level)
  const prevMap = buildPrevMap(rawPrev, level)
  const hasMetaData = rows.some((r) => r.spend !== null)

  const showAdset = level !== "campaign"
  const showAd = level === "ad"
  const nameCols = 1 + (showAdset ? 1 : 0) + (showAd ? 1 : 0)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    else { setSortKey(key); setSortDir("desc") }
  }

  const filtered = search.trim()
    ? rows.filter((r) =>
        [r.campaignName, r.metaAdsetName, r.utmContent].some((s) =>
          s.toLowerCase().includes(search.toLowerCase())
        )
      )
    : rows

  const sorted = [...filtered].sort((a, b) => {
    const av = getRowValue(a, sortKey)
    const bv = getRowValue(b, sortKey)
    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1
    const cmp =
      typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sortDir === "desc" ? -cmp : cmp
  })

  const totals = useMemo(() => {
    const tLeads = sorted.reduce((s, r) => s + r.totalLeads, 0)
    const tSales = sorted.reduce((s, r) => s + r.totalSales, 0)
    const tRevenue = sorted.reduce((s, r) => s + r.totalRevenue, 0)
    const tConv: Metric = tLeads > 0 ? (tSales / tLeads) * 100 : null
    const tSpend = hasMetaData ? sorted.reduce((s, r) => s + (r.spend ?? 0), 0) : null
    const tRoas = tSpend && tSpend > 0 ? tRevenue / tSpend : null
    return { tLeads, tSales, tRevenue, tConv, tSpend, tRoas }
  }, [sorted, hasMetaData])

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-ops-line bg-ops-s1 px-6 py-14 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ops-s2">
          <ArrowUpDown className="h-5 w-5 text-ops-tx3" />
        </div>
        <p className="text-sm font-semibold text-ops-tx">Sin datos para este período</p>
        <p className="text-xs text-ops-tx3 max-w-xs">
          Los datos aparecen cuando ingresan leads con UTM tags. Revisa que las campañas tengan parámetros configurados.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-ops-line bg-ops-s1">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-ops-line">
        {/* Level segmented control */}
        <div
          role="group"
          aria-label="Nivel de agrupación"
          className="inline-flex gap-0.5 rounded-lg border border-ops-bd bg-ops-bg p-[3px]"
        >
          {LEVELS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={level === o.value}
              onClick={() => setLevel(o.value)}
              className={`h-7 whitespace-nowrap rounded-[6px] px-3 text-[13px] font-medium transition-all focus-visible:outline-2 focus-visible:outline-ops-blue ${
                level === o.value
                  ? "bg-ops-blue text-white shadow-sm"
                  : "text-ops-tx3 hover:bg-ops-hover hover:text-ops-tx"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-0 flex-1" style={{ maxWidth: "280px" }}>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ops-tx3" />
          <input
            type="text"
            placeholder="Buscar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-md border border-ops-bd bg-ops-s2 pl-8 pr-7 text-[13px] text-ops-tx placeholder:text-ops-tx3 outline-none focus:border-ops-blue focus:ring-1 focus:ring-ops-blue/30 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ops-tx3 hover:text-ops-tx"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Row count + export */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[12px] text-ops-tx3 tabular-nums">
            {sorted.length}{search ? ` de ${rows.length}` : ""} {sorted.length === 1 ? "fila" : "filas"}
          </span>
          <button
            onClick={() => exportCSV(sorted)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ops-bd bg-ops-s2 px-3 text-[12px] font-medium text-ops-tx2 transition-colors hover:bg-ops-hover hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-ops-blue"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* No Meta Insights notice */}
      {!hasMetaData && (
        <div className="flex items-center gap-2.5 border-b border-ops-line/50 bg-ops-bg/30 px-4 py-2">
          <Zap className="h-3.5 w-3.5 shrink-0 text-ops-tx3" />
          <p className="text-[12px] text-ops-tx3">
            Conecta <span className="font-medium text-ops-tx2">Meta Ads Insights</span> en la configuración del cliente para ver CPL, CPA y ROAS.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: hasMetaData ? 1120 : 760 }}>
          <thead>
            <tr>
              <th className={`${TH} text-left w-[200px]`}>
                <button type="button" onClick={() => toggleSort("campaignName")} className="inline-flex items-center gap-1 hover:text-ops-tx">
                  Campaña <SortIcon col="campaignName" sortKey={sortKey} sortDir={sortDir} />
                </button>
              </th>
              {showAdset && (
                <th className={`${TH} text-left w-[170px]`}>
                  <button type="button" onClick={() => toggleSort("metaAdsetName")} className="inline-flex items-center gap-1 hover:text-ops-tx">
                    Conjunto <SortIcon col="metaAdsetName" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
              )}
              {showAd && (
                <th className={`${TH} text-left w-[150px]`}>
                  <button type="button" onClick={() => toggleSort("utmContent")} className="inline-flex items-center gap-1 hover:text-ops-tx">
                    Anuncio <SortIcon col="utmContent" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
              )}
              <th className={`${TH} text-right`}>
                <button type="button" onClick={() => toggleSort("totalLeads")} className="inline-flex items-center justify-end gap-1 w-full hover:text-ops-tx">
                  Leads <SortIcon col="totalLeads" sortKey={sortKey} sortDir={sortDir} />
                </button>
              </th>
              <th className={`${TH} text-right`}>
                <button type="button" onClick={() => toggleSort("totalSales")} className="inline-flex items-center justify-end gap-1 w-full hover:text-ops-tx">
                  Ventas <SortIcon col="totalSales" sortKey={sortKey} sortDir={sortDir} />
                </button>
              </th>
              <th className={`${TH} text-right`}>
                <button type="button" onClick={() => toggleSort("convRate")} className="inline-flex items-center justify-end gap-1 w-full hover:text-ops-tx">
                  Conv % <SortIcon col="convRate" sortKey={sortKey} sortDir={sortDir} />
                </button>
              </th>
              <th className={`${TH} text-right`}>
                <button type="button" onClick={() => toggleSort("totalRevenue")} className="inline-flex items-center justify-end gap-1 w-full hover:text-ops-tx">
                  Ingresos <SortIcon col="totalRevenue" sortKey={sortKey} sortDir={sortDir} />
                </button>
              </th>
              {hasMetaData && (
                <>
                  <th className={`${TH} text-right`}>
                    <button type="button" onClick={() => toggleSort("cpl")} className="inline-flex items-center justify-end gap-1 w-full hover:text-ops-tx">
                      CPL <SortIcon col="cpl" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className={`${TH} text-right`}>
                    <button type="button" onClick={() => toggleSort("cpa")} className="inline-flex items-center justify-end gap-1 w-full hover:text-ops-tx">
                      CPA <SortIcon col="cpa" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className={`${TH} text-right pr-4`}>
                    <button type="button" onClick={() => toggleSort("roas")} className="inline-flex items-center justify-end gap-1 w-full hover:text-ops-tx">
                      ROAS <SortIcon col="roas" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                </>
              )}
            </tr>
          </thead>

          <tbody>
            {sorted.map((row) => {
              const prev = prevMap[levelKey(row, level)]
              const cpl = calcCPL(row.spend, row.totalLeads)
              const cpa = calcCPA(row.spend, row.totalSales)
              const roas = calcROAS(row.totalRevenue, row.spend)
              const hasSpend = row.spend !== null

              return (
                <tr key={levelKey(row, level)} className="group transition-colors hover:bg-ops-hover">
                  {/* Campaign */}
                  <td className="border-b border-ops-line/50 px-3 py-2.5">
                    <p className="max-w-[200px] truncate font-medium text-ops-tx leading-snug" title={row.campaignName}>
                      {row.campaignName}
                    </p>
                  </td>

                  {/* Adset */}
                  {showAdset && (
                    <td className="border-b border-ops-line/50 px-3 py-2.5">
                      <p className="max-w-[170px] truncate text-ops-tx2" title={row.metaAdsetName}>
                        {row.metaAdsetName && row.metaAdsetName !== "(sin conjunto)"
                          ? row.metaAdsetName
                          : <span className="text-ops-tx3">—</span>}
                      </p>
                    </td>
                  )}

                  {/* Ad */}
                  {showAd && (
                    <td className="border-b border-ops-line/50 px-3 py-2.5">
                      <p className="max-w-[150px] truncate text-ops-tx2" title={row.utmContent}>
                        {row.utmContent || <span className="text-ops-tx3">—</span>}
                      </p>
                    </td>
                  )}

                  {/* Leads */}
                  <td className="border-b border-ops-line/50 px-3 py-2.5 text-right font-plex tabular-nums">
                    <span className="inline-flex items-center justify-end">
                      <Link
                        href={`/dashboard/campaigns/${row.campaignId}/leads`}
                        target="_blank"
                        className="font-semibold text-ops-blue hover:underline"
                        title="Ver leads de esta campaña"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.totalLeads}
                      </Link>
                      <DeltaBadge curr={row.totalLeads} prev={prev?.totalLeads ?? 0} />
                    </span>
                  </td>

                  {/* Sales */}
                  <td className="border-b border-ops-line/50 px-3 py-2.5 text-right font-plex tabular-nums">
                    <span className="inline-flex items-center justify-end">
                      <span className={row.totalSales > 0 ? "font-semibold text-ops-green" : "text-ops-tx"}>
                        {row.totalSales}
                      </span>
                      <DeltaBadge curr={row.totalSales} prev={prev?.totalSales ?? 0} />
                    </span>
                  </td>

                  {/* Conv % */}
                  <td className="border-b border-ops-line/50 px-3 py-2.5 text-right">
                    {row.convRate !== null ? (
                      <span className="inline-flex items-center justify-end gap-2">
                        <span aria-hidden className="h-1.5 w-12 overflow-hidden rounded-full bg-ops-s2">
                          <span
                            className={`block h-full rounded-full ${row.convRate >= 10 ? "bg-ops-green" : row.convRate >= 5 ? "bg-ops-amber" : "bg-ops-blue"}`}
                            style={{ width: `${Math.min(100, row.convRate * 5)}%` }}
                          />
                        </span>
                        <span className={`font-plex tabular-nums ${row.convRate >= 10 ? "font-semibold text-ops-green" : row.convRate >= 5 ? "text-ops-amber" : "text-ops-tx2"}`}>
                          {row.convRate.toFixed(1)}%
                        </span>
                        <DeltaBadge curr={row.convRate} prev={prev?.convRate ?? 0} />
                      </span>
                    ) : (
                      <span className="text-ops-tx3">—</span>
                    )}
                  </td>

                  {/* Revenue */}
                  <td className="border-b border-ops-line/50 px-3 py-2.5 text-right font-plex tabular-nums">
                    <span className="inline-flex items-center justify-end">
                      <span className={row.totalRevenue > 0 ? "font-semibold text-emerald-400" : "text-ops-tx2"}>
                        {fmtRevenue(row.totalRevenue)}
                      </span>
                      <DeltaBadge curr={row.totalRevenue} prev={prev?.totalRevenue ?? 0} />
                    </span>
                  </td>

                  {/* CPL */}
                  {hasMetaData && (
                    <td className="border-b border-ops-line/50 px-3 py-2.5 text-right font-plex tabular-nums">
                      {hasSpend
                        ? <span className="text-ops-tx">{fmtMoney(cpl, row.currency)}</span>
                        : <span className="text-ops-tx3">—</span>}
                    </td>
                  )}

                  {/* CPA */}
                  {hasMetaData && (
                    <td className="border-b border-ops-line/50 px-3 py-2.5 text-right font-plex tabular-nums">
                      {hasSpend
                        ? <span className="text-ops-tx">{fmtMoney(cpa, row.currency)}</span>
                        : <span className="text-ops-tx3">—</span>}
                    </td>
                  )}

                  {/* ROAS */}
                  {hasMetaData && (
                    <td className="border-b border-ops-line/50 px-3 py-2.5 pr-4 text-right font-plex tabular-nums">
                      {hasSpend ? (
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-[13px] font-semibold ${roasBg(roas)} ${roasColor(roas)}`}>
                          {fmtROAS(roas)}
                        </span>
                      ) : (
                        <span className="text-ops-tx3">—</span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>

          {/* Totals row */}
          {sorted.length > 1 && (
            <tfoot>
              <tr className="bg-ops-side">
                <td colSpan={nameCols} className="border-t border-ops-line px-3 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ops-tx3">
                    Total · {sorted.length} filas
                  </span>
                </td>

                {/* Leads */}
                <td className="border-t border-ops-line px-3 py-2.5 text-right font-plex tabular-nums">
                  <span className="text-[14px] font-bold text-ops-tx">{totals.tLeads.toLocaleString()}</span>
                </td>

                {/* Sales */}
                <td className="border-t border-ops-line px-3 py-2.5 text-right font-plex tabular-nums">
                  <span className={`text-[14px] font-bold ${totals.tSales > 0 ? "text-ops-green" : "text-ops-tx"}`}>
                    {totals.tSales.toLocaleString()}
                  </span>
                </td>

                {/* Conv avg */}
                <td className="border-t border-ops-line px-3 py-2.5 text-right font-plex tabular-nums">
                  <span className="text-[14px] font-bold text-ops-tx">
                    {totals.tConv !== null ? `${totals.tConv.toFixed(1)}%` : "—"}
                  </span>
                </td>

                {/* Revenue */}
                <td className="border-t border-ops-line px-3 py-2.5 text-right font-plex tabular-nums">
                  <span className={`text-[14px] font-bold ${totals.tRevenue > 0 ? "text-emerald-400" : "text-ops-tx"}`}>
                    {fmtRevenue(totals.tRevenue)}
                  </span>
                </td>

                {hasMetaData && (
                  <>
                    {/* CPL total */}
                    <td className="border-t border-ops-line px-3 py-2.5 text-right font-plex tabular-nums">
                      <span className="text-[14px] font-bold text-ops-tx">
                        {totals.tSpend !== null && totals.tLeads > 0
                          ? fmtMoney(totals.tSpend / totals.tLeads)
                          : "—"}
                      </span>
                    </td>

                    {/* CPA total */}
                    <td className="border-t border-ops-line px-3 py-2.5 text-right font-plex tabular-nums">
                      <span className="text-[14px] font-bold text-ops-tx">
                        {totals.tSpend !== null && totals.tSales > 0
                          ? fmtMoney(totals.tSpend / totals.tSales)
                          : "—"}
                      </span>
                    </td>

                    {/* ROAS total */}
                    <td className="border-t border-ops-line px-3 py-2.5 pr-4 text-right font-plex tabular-nums">
                      {totals.tRoas !== null ? (
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-[13px] font-bold ${roasBg(totals.tRoas)} ${roasColor(totals.tRoas)}`}>
                          {fmtROAS(totals.tRoas)}
                        </span>
                      ) : (
                        <span className="text-[14px] font-bold text-ops-tx3">—</span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { ArrowUpDown, ArrowUp, ArrowDown, Download } from "lucide-react"
import { Panel, opsTable } from "@/components/app/ops"
import type { PerformanceRow, Metric } from "@/domains/analytics/types"
import { logCsvExportAction } from "@/domains/analytics/actions"

interface Props {
  rows: PerformanceRow[]
  prevRows: PerformanceRow[]
}

type SortKey = keyof PerformanceRow
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
      })
    } else {
      cur.totalLeads += r.totalLeads
      cur.totalSales += r.totalSales
      cur.totalRevenue += r.totalRevenue
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

function DeltaCell({ curr, prev }: { curr: number | null; prev: number | null }) {
  const pct = delta(curr, prev)
  if (pct === null) return <span className="text-ops-tx3">—</span>
  const abs = Math.abs(pct)
  if (abs < 0.5) return <span className="text-ops-tx3 text-xs">→</span>
  if (pct > 0)
    return <span className="text-ops-green text-xs ml-1.5">▲{abs.toFixed(0)}%</span>
  return <span className="text-ops-coral text-xs ml-1.5">▼{abs.toFixed(0)}%</span>
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="h-3 w-3 inline ml-1 text-ops-tx3" />
  return sortDir === "desc"
    ? <ArrowDown className="h-3 w-3 inline ml-1 text-ops-blue-t" />
    : <ArrowUp className="h-3 w-3 inline ml-1 text-ops-blue-t" />
}

// Prefix cells that start with formula-injection characters so spreadsheet apps
// treat them as plain text, not as formulas.
function sanitizeCsv(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

function fmtMetric(m: Metric, suffix = ""): string {
  return m === null ? "N/D" : `${m.toFixed(2)}${suffix}`
}

async function exportCSV(rows: PerformanceRow[], prevMap: Record<string, PerformanceRow>) {
  const header = "Campaña,ID Campaña,Conjunto de anuncios,Anuncio,Leads,Ventas,Conversión %,Ingresos"
  const lines = rows.map((r) => {
    return [
      `"${sanitizeCsv(r.campaignName)}"`,
      `"${r.campaignId}"`,
      `"${sanitizeCsv(r.metaAdsetName)}"`,
      `"${sanitizeCsv(r.utmContent)}"`,
      r.totalLeads,
      r.totalSales,
      `"${fmtMetric(r.convRate, "%")}"`,
      r.totalRevenue.toFixed(2),
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
  void logCsvExportAction(`rendimiento`, rows.length)
}

const COLS: { key: SortKey; label: string; align?: string }[] = [
  { key: "campaignName", label: "Campaña" },
  { key: "metaAdsetName", label: "Conjunto" },
  { key: "utmContent", label: "Anuncio" },
  { key: "totalLeads", label: "Leads", align: "right" },
  { key: "totalSales", label: "Ventas", align: "right" },
  { key: "convRate", label: "Conv %", align: "right" },
  { key: "totalRevenue", label: "Ingresos", align: "right" },
]

export function PerformanceView({ rows: rawRows, prevRows: rawPrev }: Props) {
  const [level, setLevel] = useState<Level>("ad")
  const [sortKey, setSortKey] = useState<SortKey>("totalLeads")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const rows = aggregate(rawRows, level)
  const prevMap = buildPrevMap(rawPrev, level)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1
    const cmp =
      typeof av === "string"
        ? (av as string).localeCompare(bv as string)
        : (av as number) - (bv as number)
    return sortDir === "desc" ? -cmp : cmp
  })

  const cols = COLS.filter(
    (c) => !((level === "campaign" && (c.key === "metaAdsetName" || c.key === "utmContent")) || (level === "adset" && c.key === "utmContent"))
  )

  if (rows.length === 0) {
    return (
      <Panel>
        <p className="p-12 text-center text-sm text-ops-tx3">
          Sin datos para este período. Los datos aparecerán cuando ingresen leads con UTM tags.
        </p>
      </Panel>
    )
  }

  const nd = (
    <td className={`${opsTable.tdRight} ${opsTable.mono}`}>
      <span className="text-ops-tx3">N/D</span>
      <span className="block text-[12px] font-sans text-ops-tx3">Requiere Meta Ads Insights</span>
    </td>
  )

  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-3">
          <span
            role="group"
            aria-label="Nivel"
            className="inline-flex gap-0.5 rounded-lg border border-ops-bd bg-ops-side p-[3px]"
          >
            {LEVELS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={level === o.value}
                onClick={() => setLevel(o.value)}
                className={`h-7 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ops-blue ${
                  level === o.value
                    ? "bg-ops-sel text-ops-tx shadow-[inset_0_-2px_0_var(--color-ops-blue)]"
                    : "text-ops-tx2 hover:bg-ops-hover hover:text-ops-tx"
                }`}
              >
                {o.label}
              </button>
            ))}
          </span>
          <span className="text-xs font-normal text-ops-tx2">
            {rows.length} filas · las flechas indican cambio vs periodo anterior
          </span>
        </span>
      }
      actions={
        <button
          onClick={() => exportCSV(sorted, prevMap)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ops-bd px-3 text-xs text-ops-tx transition-colors hover:bg-ops-hover focus-visible:outline-2 focus-visible:outline-ops-blue"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </button>
      }
    >
      <div className={opsTable.wrap}>
        <table className={`${opsTable.table} min-w-[960px]`}>
          <thead>
            <tr>
              {cols.map((col) => (
                <th
                  key={col.key}
                  aria-sort={sortKey === col.key ? (sortDir === "desc" ? "descending" : "ascending") : "none"}
                  className={col.align === "right" ? opsTable.thRight : opsTable.th}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className="whitespace-nowrap hover:text-ops-tx focus-visible:outline-2 focus-visible:outline-ops-blue"
                  >
                    {col.label}
                    <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
              ))}
              <th className={opsTable.thRight}>CPL</th>
              <th className={opsTable.thRight}>CPA</th>
              <th className={opsTable.thRight}>ROAS</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const prev = prevMap[levelKey(row, level)]
              return (
                <tr key={levelKey(row, level)} className={opsTable.row}>
                  {cols.some((c) => c.key === "campaignName") && (
                    <td className={`${opsTable.td} font-medium`}>{row.campaignName}</td>
                  )}
                  {cols.some((c) => c.key === "metaAdsetName") && (
                    <td className={`${opsTable.td} max-w-[160px] truncate text-ops-tx2`} title={row.metaAdsetName}>
                      {row.metaAdsetName === "(sin conjunto)" ? <span className="text-ops-tx3">—</span> : row.metaAdsetName}
                    </td>
                  )}
                  {cols.some((c) => c.key === "utmContent") && (
                    <td className={`${opsTable.td} max-w-[180px] truncate text-ops-tx2`}>{row.utmContent}</td>
                  )}
                  <td className={`${opsTable.tdRight} ${opsTable.mono}`}>
                    {row.totalLeads}
                    <DeltaCell curr={row.totalLeads} prev={prev?.totalLeads ?? 0} />
                  </td>
                  <td className={`${opsTable.tdRight} ${opsTable.mono}`}>
                    {row.totalSales}
                    <DeltaCell curr={row.totalSales} prev={prev?.totalSales ?? 0} />
                  </td>
                  <td className={`${opsTable.tdRight} ${opsTable.mono}`}>
                    {row.convRate !== null ? (
                      <span className="inline-flex items-center justify-end gap-2">
                        <span aria-hidden className="h-1.5 w-14 overflow-hidden rounded-sm bg-ops-s2">
                          <span
                            className={`block h-full ${row.convRate >= 10 ? "bg-ops-green" : row.convRate >= 5 ? "bg-ops-amber" : "bg-ops-blue"}`}
                            style={{ width: `${Math.min(100, row.convRate)}%` }}
                          />
                        </span>
                        <span className={row.convRate >= 10 ? "text-ops-green" : row.convRate >= 5 ? "text-ops-amber" : "text-ops-tx2"}>
                          {row.convRate.toFixed(1)}%
                        </span>
                        <DeltaCell curr={row.convRate} prev={prev?.convRate ?? 0} />
                      </span>
                    ) : (
                      <span className="text-ops-tx3">N/D</span>
                    )}
                  </td>
                  <td className={`${opsTable.tdRight} ${opsTable.mono}`}>
                    ${row.totalRevenue.toFixed(2)}
                    <DeltaCell curr={row.totalRevenue} prev={prev?.totalRevenue ?? 0} />
                  </td>
                  {nd}
                  {nd}
                  {nd}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

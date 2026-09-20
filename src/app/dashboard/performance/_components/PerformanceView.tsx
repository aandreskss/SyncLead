"use client"

import { useState } from "react"
import { ArrowUpDown, ArrowUp, ArrowDown, Download } from "lucide-react"
import type { PerformanceRow, Metric } from "@/domains/analytics/types"
import { logCsvExportAction } from "@/domains/analytics/actions"

interface Props {
  rows: PerformanceRow[]
  prevRows: PerformanceRow[]
}

type SortKey = keyof PerformanceRow
type SortDir = "asc" | "desc"

function buildPrevMap(prevRows: PerformanceRow[]): Record<string, PerformanceRow> {
  const map: Record<string, PerformanceRow> = {}
  for (const r of prevRows) {
    map[`${r.campaignId}||${r.metaAdsetName}||${r.utmContent}`] = r
  }
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
  if (pct === null) return <span className="text-zinc-700">—</span>
  const abs = Math.abs(pct)
  if (abs < 0.5) return <span className="text-zinc-600 text-xs">→</span>
  if (pct > 0)
    return <span className="text-emerald-400 text-xs ml-1.5">▲{abs.toFixed(0)}%</span>
  return <span className="text-red-400 text-xs ml-1.5">▼{abs.toFixed(0)}%</span>
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="h-3 w-3 inline ml-1 text-zinc-600" />
  return sortDir === "desc"
    ? <ArrowDown className="h-3 w-3 inline ml-1 text-indigo-400" />
    : <ArrowUp className="h-3 w-3 inline ml-1 text-indigo-400" />
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

export function PerformanceView({ rows, prevRows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("totalLeads")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const prevMap = buildPrevMap(prevRows)

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

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center text-zinc-600 text-sm">
        Sin datos para este período. Los datos aparecerán cuando ingresen leads con UTM tags.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800">
        <p className="text-sm font-medium text-zinc-300">
          {rows.length} filas · las flechas indican cambio vs periodo anterior
        </p>
        <button
          onClick={() => exportCSV(sorted, prevMap)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60">
              {COLS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={`px-4 py-3 font-medium text-zinc-400 cursor-pointer hover:text-zinc-200 select-none whitespace-nowrap ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {col.label}
                  <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {sorted.map((row, i) => {
              const prev = prevMap[`${row.campaignId}||${row.metaAdsetName}||${row.utmContent}`]
              return (
                <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 text-zinc-200 font-medium">{row.campaignName}</td>
                  <td className="px-4 py-3 text-zinc-400 max-w-[160px] truncate" title={row.metaAdsetName}>
                    {row.metaAdsetName === "(sin conjunto)"
                      ? <span className="text-zinc-600">—</span>
                      : <span className="text-indigo-400/80">{row.metaAdsetName}</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 max-w-[180px] truncate">{row.utmContent}</td>
                  <td className="px-4 py-3 text-right text-zinc-200 font-mono">
                    {row.totalLeads}
                    <DeltaCell curr={row.totalLeads} prev={prev?.totalLeads ?? 0} />
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-200 font-mono">
                    {row.totalSales}
                    <DeltaCell curr={row.totalSales} prev={prev?.totalSales ?? 0} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {row.convRate !== null ? (
                      <>
                        <span
                          className={
                            row.convRate >= 10
                              ? "text-emerald-400"
                              : row.convRate >= 5
                              ? "text-amber-400"
                              : "text-zinc-400"
                          }
                        >
                          {row.convRate.toFixed(1)}%
                        </span>
                        <DeltaCell curr={row.convRate} prev={prev?.convRate ?? 0} />
                      </>
                    ) : (
                      <span className="text-zinc-600">N/D</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-300 font-mono">
                    ${row.totalRevenue.toFixed(2)}
                    <DeltaCell curr={row.totalRevenue} prev={prev?.totalRevenue ?? 0} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

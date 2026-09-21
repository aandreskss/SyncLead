"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ChevronDown, ChevronsUpDown, Download, Megaphone } from "lucide-react"
import { logCsvExportAction } from "@/domains/analytics/actions"
import { fmt, fmtMoney } from "./format"

export interface CampaignRow {
  id: string
  name: string
  active: boolean | null
  leads: number
  sales: number
  conv: number | null
  revenue: number
}

type Key = "name" | "leads" | "sales" | "conv" | "revenue"

function sanitizeCsv(value: string) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

function StatusChip({ active }: { active: boolean | null }) {
  if (active === null) return <span className="text-[13px] text-ops-tx3">—</span>
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium ${
        active ? "bg-[#12241f] text-ops-green" : "bg-[#1a222d] text-ops-tx2"
      }`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${active ? "bg-ops-green" : "bg-ops-tx2"}`} />
      {active ? "Activa" : "Pausada"}
    </span>
  )
}

function ConvBar({ pct, wide = false }: { pct: number | null; wide?: boolean }) {
  if (pct === null) return <span className="font-plex text-sm text-ops-tx3">N/D</span>
  return (
    <span className="flex items-center gap-2.5">
      <span className="font-plex min-w-[56px] text-sm text-ops-tx">{fmt(pct, 1)} %</span>
      <span aria-hidden className={`h-1 overflow-hidden rounded-sm bg-ops-line ${wide ? "w-24" : "w-14"}`}>
        <span className="block h-1 bg-ops-blue/85" style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
    </span>
  )
}

export function CampaignTable({ rows, total }: { rows: CampaignRow[]; total: number }) {
  const [key, setKey] = useState<Key>("sales")
  const [dir, setDir] = useState<"asc" | "desc">("desc")

  const sorted = useMemo(() => {
    const m = dir === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      if (key === "name") return a.name.localeCompare(b.name, "es") * m
      const av = a[key] ?? -1
      const bv = b[key] ?? -1
      return (av - bv) * m || a.name.localeCompare(b.name, "es")
    })
  }, [rows, key, dir])

  function sortBy(k: Key) {
    if (k === key) setDir(dir === "desc" ? "asc" : "desc")
    else {
      setKey(k)
      setDir(k === "name" ? "asc" : "desc")
    }
  }

  function exportCsv() {
    const header = "Campaña,Estado,Leads,Ventas,Conversión %,Ingresos"
    const lines = sorted.map((r) =>
      [
        `"${sanitizeCsv(r.name)}"`,
        r.active === null ? "" : r.active ? "Activa" : "Pausada",
        r.leads,
        r.sales,
        r.conv === null ? "" : r.conv.toFixed(1),
        r.revenue.toFixed(2),
      ].join(","),
    )
    const blob = new Blob(["﻿" + [header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `campanas_${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    void logCsvExportAction("dashboard_campanas", sorted.length)
  }

  const th = (k: Key, label: string, right = false) => {
    const on = key === k
    return (
      <th scope="col" aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"} className={`px-3 py-2 font-medium ${right ? "text-right" : "text-left"}`}>
        <button
          type="button"
          onClick={() => sortBy(k)}
          className={`inline-flex items-center gap-1 text-xs font-medium transition-colors duration-150 hover:text-ops-tx ${on ? "text-ops-tx" : "text-ops-tx3"} ${right ? "flex-row-reverse" : ""}`}
        >
          {label}
          {on ? (
            <ChevronDown className={`h-3.5 w-3.5 text-ops-blue-t transition-transform duration-150 ${dir === "asc" ? "rotate-180" : ""}`} aria-hidden="true" />
          ) : (
            <ChevronsUpDown className="h-3 w-3" aria-hidden="true" />
          )}
        </button>
      </th>
    )
  }

  return (
    <section aria-label="Rendimiento por campaña" className="overflow-hidden rounded-lg border border-ops-line bg-ops-s1">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 pb-4 lg:p-5">
        <div>
          <h2 className="text-base font-semibold text-ops-tx">Rendimiento por campaña</h2>
          <p className="mt-1 text-[13px] text-ops-tx2">Ordena las columnas con un clic</p>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex h-[34px] items-center gap-2 rounded-lg border border-ops-bd bg-ops-s1 px-3 text-[13px] font-medium text-ops-tx transition-colors duration-150 hover:border-ops-bd2 hover:bg-ops-raised"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Exportar CSV
            </button>
          )}
          <Link
            href="/dashboard/campaigns"
            className="inline-flex h-[34px] items-center rounded-lg border border-ops-bd bg-ops-s1 px-3 text-[13px] font-medium text-ops-tx transition-colors duration-150 hover:border-ops-bd2 hover:bg-ops-raised"
          >
            Ver todas las campañas
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex items-start gap-4 border-t border-ops-line p-6">
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#16213a] text-ops-blue-t">
            <Megaphone className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-ops-tx">Todavía no hay campañas con leads en este periodo</h3>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ops-tx2">
              Cuando un lead llegue asociado a una campaña, aparecerá aquí con sus ventas e ingresos. Crea una campaña o revisa que tus formularios envíen los datos.
            </p>
            <div className="mt-4 flex gap-2">
              <Link href="/dashboard/campaigns" className="inline-flex h-9 items-center rounded-lg bg-ops-blue px-3.5 text-[13px] font-semibold text-ops-bg transition-opacity duration-150 hover:opacity-90">
                Ir a campañas
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Tabla (md+) */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-y border-ops-line bg-ops-side">
                  {th("name", "Campaña")}
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-ops-tx3">Estado</th>
                  {th("leads", "Leads", true)}
                  {th("sales", "Ventas", true)}
                  {th("conv", "Conversión")}
                  {th("revenue", "Ingresos", true)}
                  <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-ops-tx3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className="border-b border-ops-line transition-colors duration-150 last:border-b-0 hover:bg-ops-hover">
                    <td className="h-[60px] max-w-[280px] truncate px-3 pl-5 font-medium text-ops-tx">{r.name}</td>
                    <td className="px-3"><StatusChip active={r.active} /></td>
                    <td className="font-plex px-3 text-right">{fmt(r.leads)}</td>
                    <td className="font-plex px-3 text-right">{fmt(r.sales)}</td>
                    <td className="px-3"><ConvBar pct={r.conv} /></td>
                    <td className="font-plex px-3 text-right">{fmtMoney(r.revenue)}</td>
                    <td className="px-3 pr-5 text-right">
                      <Link href={`/dashboard/campaigns/${r.id}/leads`} className="text-[13px] font-medium text-ops-blue-t hover:text-[#a9bdff]">
                        Ver leads
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Lista (móvil) */}
          <ul className="border-t border-ops-line md:hidden">
            {sorted.map((r) => (
              <li key={r.id} className="border-b border-ops-line p-4 last:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[15px] font-medium text-ops-tx">{r.name}</span>
                  <StatusChip active={r.active} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    ["Leads", fmt(r.leads)],
                    ["Ventas", fmt(r.sales)],
                    ["Ingresos", fmtMoney(r.revenue)],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <dt className="text-xs text-ops-tx3">{l}</dt>
                      <dd className="font-plex mt-0.5 text-base font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex items-center gap-2.5">
                  <span className="min-w-[66px] text-xs text-ops-tx3">Conversión</span>
                  <ConvBar pct={r.conv} wide />
                </div>
                <Link href={`/dashboard/campaigns/${r.id}/leads`} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-ops-blue-t">
                  Ver leads
                </Link>
              </li>
            ))}
          </ul>
          <p className="border-t border-ops-line px-5 py-3 text-[13px] text-ops-tx3">
            Mostrando {rows.length} de {total} campañas · La conversión se calcula como ventas ÷ leads.
          </p>
        </>
      )}
    </section>
  )
}

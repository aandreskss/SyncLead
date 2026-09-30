"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { SUPPORTED_COUNTRIES } from "@/domains/ad-research/types"
import type { AdPlatform } from "@/domains/ad-research/types"
import { opsField, opsBtnPrimary } from "@/components/app/ops"

export interface SearchParams {
  query: string
  countries: string[]
  platforms: AdPlatform[]
  activeOnly: boolean
  period: 7 | 30 | 180
  industryId?: string
}

interface Props {
  onSearch: (params: SearchParams) => void
  loading: boolean
}

export function AdSearchForm({ onSearch, loading }: Props) {
  const [query, setQuery] = useState("")
  const [country, setCountry] = useState("VE")
  const [platforms, setPlatforms] = useState<AdPlatform[]>(["meta"])
  const [activeOnly, setActiveOnly] = useState(false)
  const [period, setPeriod] = useState<7 | 30 | 180>(30)

  function togglePlatform(p: AdPlatform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    onSearch({ query: query.trim(), countries: [country], platforms, activeOnly, period })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[20px] border border-ops-line bg-ops-s1 p-4 shadow-ops-card space-y-3"
    >
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ops-tx3" />
          <input
            type="text"
            placeholder="Keyword o nombre del advertiser..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={opsField + " w-full pl-9"}
          />
        </div>

        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className={opsField}
        >
          {SUPPORTED_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-ops-tx">
            <input
              type="checkbox"
              checked={platforms.includes("meta")}
              onChange={() => togglePlatform("meta")}
              className="rounded"
            />
            Meta
          </label>
          <span
            className="flex items-center gap-1.5 text-sm select-none text-ops-tx3"
            title="TikTok requiere API key oficial de TikTok for Business"
          >
            <input type="checkbox" disabled className="rounded opacity-40" />
            TikTok
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-ops-s2 text-ops-tx3 border border-ops-bd">
              próximamente
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-ops-tx3">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="rounded"
            />
            Solo activos
          </label>

          <select
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value) as 7 | 30 | 180)}
            className={opsField}
          >
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={180}>180 días</option>
          </select>

          <button
            type="submit"
            disabled={loading || !query.trim()}
            className={opsBtnPrimary + " disabled:opacity-50"}
          >
            {loading ? "Buscando..." : "Buscar anuncios"}
          </button>
        </div>
      </div>
    </form>
  )
}

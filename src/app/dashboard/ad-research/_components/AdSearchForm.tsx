"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { SUPPORTED_COUNTRIES } from "@/domains/ad-research/types"
import type { AdPlatform } from "@/domains/ad-research/types"

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
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: "var(--sg-border)", background: "var(--sg-s1)" }}
    >
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: "var(--sg-muted)" }}
          />
          <input
            type="text"
            placeholder="Keyword o nombre del advertiser..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm focus:outline-none"
            style={{
              background: "var(--sg-s2)",
              border: "1px solid var(--sg-border)",
              color: "var(--sg-ink)",
            }}
          />
        </div>

        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="px-3 py-2.5 rounded-lg text-sm focus:outline-none"
          style={{
            background: "var(--sg-s2)",
            border: "1px solid var(--sg-border)",
            color: "var(--sg-ink)",
          }}
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
          <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: "var(--sg-ink)" }}>
            <input
              type="checkbox"
              checked={platforms.includes("meta")}
              onChange={() => togglePlatform("meta")}
              className="rounded"
            />
            Meta
          </label>
          <span
            className="flex items-center gap-1.5 text-sm select-none"
            style={{ color: "var(--sg-muted)" }}
            title="TikTok requiere API key oficial de TikTok for Business"
          >
            <input type="checkbox" disabled className="rounded opacity-40" />
            TikTok
            <span
              className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--sg-s2)", color: "var(--sg-muted)", border: "1px solid var(--sg-border)" }}
            >
              próximamente
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: "var(--sg-muted)" }}>
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
            className="px-3 py-1.5 rounded-lg text-sm focus:outline-none"
            style={{
              background: "var(--sg-s2)",
              border: "1px solid var(--sg-border)",
              color: "var(--sg-ink)",
            }}
          >
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={180}>180 días</option>
          </select>

          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: "var(--sg-accent)", color: "var(--sg-on-accent)" }}
          >
            {loading ? "Buscando..." : "Buscar anuncios"}
          </button>
        </div>
      </div>
    </form>
  )
}

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarDays } from "lucide-react"

const PRESETS = [
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "90d", label: "90 días" },
  { value: "custom", label: "Personalizado" },
]

interface Props {
  currentPreset: string
  customFrom?: string
  customTo?: string
  basePath?: string
}

export function DateRangeSelector({ currentPreset, customFrom, customTo, basePath = "/dashboard" }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [showCustom, setShowCustom] = useState(currentPreset === "custom")
  const [from, setFrom] = useState(customFrom ?? "")
  const [to, setTo] = useState(customTo ?? "")

  function applyPreset(preset: string) {
    if (preset === "custom") {
      setShowCustom(true)
      return
    }
    setShowCustom(false)
    startTransition(() => {
      router.push(`${basePath}?range=${preset}`)
    })
  }

  function applyCustom() {
    if (!from || !to || from > to) return
    startTransition(() => {
      router.push(`${basePath}?range=custom&from=${from}&to=${to}`)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CalendarDays className="h-4 w-4 text-zinc-500 shrink-0" />
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => applyPreset(p.value)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              currentPreset === p.value
                ? "bg-indigo-600 text-white"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
          />
          <span className="text-zinc-600 text-xs">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={applyCustom}
            disabled={!from || !to || from > to}
            className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors disabled:opacity-40"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}

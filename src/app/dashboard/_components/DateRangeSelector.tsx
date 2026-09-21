"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, RefreshCw, SlidersHorizontal } from "lucide-react"

const PRESETS = [
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "90d", label: "90 días" },
  { value: "custom", label: "Personalizado" },
]

interface Client {
  id: string
  name: string
}

interface Props {
  currentPreset: string
  customFrom?: string
  customTo?: string
  basePath?: string
  clients?: Client[]
  currentClientId?: string
}

const fieldCls =
  "h-9 rounded-md border border-ops-bd bg-ops-s1 px-3 text-[13px] text-ops-tx outline-none transition-colors hover:border-ops-bd2 focus-visible:border-ops-blue focus-visible:ring-2 focus-visible:ring-ops-blue/40"

export function DateRangeSelector({
  currentPreset,
  customFrom,
  customTo,
  basePath = "/dashboard",
  clients,
  currentClientId,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showCustom, setShowCustom] = useState(currentPreset === "custom")
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(customFrom ?? "")
  const [to, setTo] = useState(customTo ?? "")

  function applyPreset(preset: string) {
    if (preset === "custom") {
      setShowCustom(true)
      return
    }
    setShowCustom(false)
    const clientParam = currentClientId ? `&clientId=${currentClientId}` : ""
    startTransition(() => {
      router.push(`${basePath}?range=${preset}${clientParam}`)
    })
  }

  function applyCustom() {
    if (!from || !to || from > to) return
    const clientParam = currentClientId ? `&clientId=${currentClientId}` : ""
    startTransition(() => {
      router.push(`${basePath}?range=custom&from=${from}&to=${to}${clientParam}`)
    })
  }

  function applyClient(id: string) {
    const dateParam =
      currentPreset === "custom" && customFrom && customTo
        ? `range=custom&from=${customFrom}&to=${customTo}`
        : `range=${currentPreset}`
    const clientParam = id ? `&clientId=${id}` : ""
    startTransition(() => {
      router.push(`${basePath}?${dateParam}${clientParam}`)
    })
  }

  const invalid = !from || !to || from > to

  return (
    <div className="flex flex-col items-stretch gap-2 md:items-end">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="dash-filters"
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-ops-bd bg-ops-s1 px-3 text-[13px] text-ops-tx md:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Filtros
      </button>

      <div
        id="dash-filters"
        className={`${open ? "flex" : "hidden"} flex-col gap-2 md:flex md:flex-row md:flex-wrap md:items-center md:justify-end`}
      >
        {clients && clients.length > 0 && (
          <div className="relative">
            <select
              aria-label="Cliente"
              value={currentClientId ?? ""}
              onChange={(e) => applyClient(e.target.value)}
              className={`${fieldCls} w-full appearance-none pr-8 md:w-48`}
            >
              <option value="">Todos los clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ops-tx2"
              aria-hidden
            />
          </div>
        )}

        <div
          role="group"
          aria-label="Periodo"
          className="flex overflow-hidden rounded-md border border-ops-bd bg-ops-s1"
        >
          {PRESETS.map((p) => {
            const active = currentPreset === p.value
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => applyPreset(p.value)}
                aria-pressed={active}
                className={`h-9 flex-1 px-3 text-[13px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ops-blue md:flex-none ${
                  active
                    ? "bg-ops-sel text-ops-tx shadow-[inset_0_-2px_0_#4c7dff]"
                    : "text-ops-tx2 hover:bg-ops-hover hover:text-ops-tx"
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {showCustom && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Desde"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={`${fieldCls} min-w-0 flex-1 md:flex-none`}
            />
            <span className="text-xs text-ops-tx3" aria-hidden>
              →
            </span>
            <input
              type="date"
              aria-label="Hasta"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={`${fieldCls} min-w-0 flex-1 md:flex-none`}
            />
            <button
              type="button"
              onClick={applyCustom}
              disabled={invalid}
              className="h-9 rounded-md bg-ops-blue px-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => startTransition(() => router.refresh())}
          disabled={pending}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-ops-bd bg-ops-s1 px-3 text-[13px] text-ops-tx transition-colors hover:border-ops-bd2 hover:bg-ops-hover focus-visible:outline-2 focus-visible:outline-ops-blue disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
          Actualizar
        </button>
      </div>
    </div>
  )
}

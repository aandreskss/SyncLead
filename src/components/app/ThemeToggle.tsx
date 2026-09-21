"use client"

import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"
import { useEffect, useState } from "react"

interface Props {
  collapsed?: boolean
}

export function ThemeToggle({ collapsed }: Props) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ops-bd" />
    )
  }

  const isDark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Activar modo claro" : "Activar modo oscuro"}
      title={isDark ? "Modo claro" : "Modo oscuro"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ops-bd text-ops-tx2 transition-colors duration-150 hover:border-ops-bd2 hover:bg-ops-raised hover:text-ops-tx"
    >
      {isDark
        ? <Sun className="h-4 w-4" aria-hidden="true" />
        : <Moon className="h-4 w-4" aria-hidden="true" />
      }
      {collapsed !== false && <span className="sr-only">{isDark ? "Modo claro" : "Modo oscuro"}</span>}
    </button>
  )
}

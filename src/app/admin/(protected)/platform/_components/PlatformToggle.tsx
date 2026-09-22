"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updatePlatformConfigAction } from "@/app/admin/(protected)/_actions"

interface Props {
  configKey: string
  value: boolean
}

export function PlatformToggle({ configKey, value }: Props) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(value)
  const [pending, startTransition] = useTransition()

  function handleToggle() {
    const next = !enabled
    setEnabled(next)
    startTransition(async () => {
      const r = await updatePlatformConfigAction(configKey, next)
      if (r.error) {
        setEnabled(enabled) // revert
      } else {
        router.refresh()
      }
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      role="switch"
      aria-checked={enabled}
      style={{
        flexShrink: 0,
        width: 44, height: 24, borderRadius: 12,
        background: enabled ? "#16a34a" : "#27272a",
        border: "none", cursor: pending ? "not-allowed" : "pointer",
        position: "relative", transition: "background 0.2s",
        opacity: pending ? 0.7 : 1,
      }}
    >
      <span style={{
        position: "absolute",
        top: 2, left: enabled ? 22 : 2,
        width: 20, height: 20, borderRadius: "50%",
        background: "#fff",
        transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }} />
    </button>
  )
}

"use client"

import { useRouter } from "next/navigation"
import { useTransition, useState } from "react"
import { linkMetaCampaignAction } from "@/domains/meta-insights/actions"

interface Props {
  clientId: string
  metaCampaignId: string
  metaCampaignName: string
  currentInternalId: string | null
  internalCampaigns: { id: string; name: string }[]
}

export function CampaignLinkButton({
  clientId,
  metaCampaignId,
  metaCampaignName,
  currentInternalId,
  internalCampaigns,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value || null
    startTransition(async () => {
      await linkMetaCampaignAction(clientId, metaCampaignId, value)
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title={currentInternalId ? "Cambiar vínculo con campaña SyncLead" : "Vincular con campaña SyncLead"}
        className="ml-1 rounded px-1 py-0.5 text-[10px] text-ops-tx3 hover:text-ops-tx hover:bg-ops-hover transition-colors"
      >
        {currentInternalId ? "🔗" : "⊕"}
      </button>
    )
  }

  return (
    <div className="mt-1 flex items-center gap-1">
      <select
        autoFocus
        disabled={isPending}
        defaultValue={currentInternalId ?? ""}
        onChange={handleChange}
        className="rounded border border-ops-line bg-ops-s2 px-1.5 py-0.5 text-[10px] text-ops-tx max-w-[160px] focus:outline-none focus:border-ops-blue"
      >
        <option value="">— Sin vínculo —</option>
        {internalCampaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => setOpen(false)}
        className="text-ops-tx3 hover:text-ops-tx text-[10px]"
      >
        ✕
      </button>
    </div>
  )
}

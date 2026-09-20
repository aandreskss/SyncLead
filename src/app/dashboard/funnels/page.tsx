import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getOrganizationByOwnerId } from "@/domains/organizations/repository"
import {
  getFunnelsByOrgId,
  getFunnelById,
  getLeadsForKanban,
  getCampaignOptionsForFunnel,
} from "@/domains/funnels/repository"
import type { LeadStage, FunnelStageConfig } from "@/lib/db/schema"
import { FunnelsView } from "./_components/FunnelsView"

export default async function FunnelsPage({
  searchParams,
}: {
  searchParams: Promise<{
    funnelId?: string
    campaignId?: string
    temperature?: string
    assignedTo?: string
  }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const org = await getOrganizationByOwnerId(session.user.id)
  if (!org) redirect("/onboarding")

  const sp = await searchParams

  const [allFunnels, campaignOptions] = await Promise.all([
    getFunnelsByOrgId(org.id),
    getCampaignOptionsForFunnel(org.id),
  ])

  const selectedFunnelId = sp.funnelId ?? allFunnels[0]?.id
  const selectedFunnel = selectedFunnelId
    ? await getFunnelById(selectedFunnelId, org.id)
    : null

  const stageKeys: LeadStage[] = (selectedFunnel?.stages ?? []).map(
    (s: FunnelStageConfig) => s.stageKey
  )

  const leads = selectedFunnel
    ? await getLeadsForKanban(org.id, stageKeys, {
        campaignId: sp.campaignId,
        temperature: sp.temperature,
        assignedTo: sp.assignedTo,
      })
    : []

  return (
    <FunnelsView
      funnels={allFunnels}
      selectedFunnel={selectedFunnel}
      leads={leads}
      campaignOptions={campaignOptions}
      filters={{
        campaignId: sp.campaignId ?? "",
        temperature: sp.temperature ?? "",
        assignedTo: sp.assignedTo ?? "",
      }}
    />
  )
}

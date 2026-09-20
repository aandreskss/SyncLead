import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import {
  getFunnelsByOrgId,
  getFunnelById,
  getLeadsForKanban,
  getCampaignOptionsForFunnel,
} from "@/domains/funnels/repository"
import { getCampaignWithClientById } from "@/domains/campaigns/repository"
import { listSalesReps } from "@/domains/team/repository"
import type { LeadStage, FunnelStageConfig, SalesRep } from "@/lib/db/schema"
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
  let ctx: Awaited<ReturnType<typeof requireOrganizationMembership>>
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) redirect("/login")
    throw e
  }
  const orgId = ctx.orgId

  const sp = await searchParams

  const [allFunnels, campaignOptions] = await Promise.all([
    getFunnelsByOrgId(orgId),
    getCampaignOptionsForFunnel(orgId),
  ])

  const selectedFunnelId = sp.funnelId ?? allFunnels[0]?.id
  const selectedFunnel = selectedFunnelId
    ? await getFunnelById(selectedFunnelId, orgId)
    : null

  const stageKeys: LeadStage[] = (selectedFunnel?.stages ?? []).map(
    (s: FunnelStageConfig) => s.stageKey
  )

  const leads = selectedFunnel
    ? await getLeadsForKanban(orgId, stageKeys, {
        campaignId: sp.campaignId,
        temperature: sp.temperature,
        assignedTo: sp.assignedTo,
      })
    : []

  // Load client data for LeadDrawer when a campaign filter is active
  let kanbanClientId: string | undefined
  let kanbanWhatsappNumbers: string[] = []
  let kanbanSalesReps: SalesRep[] = []

  if (sp.campaignId) {
    const campaign = await getCampaignWithClientById(sp.campaignId, orgId)
    if (campaign?.clientId) {
      kanbanClientId = campaign.clientId
      const client = campaign.client as { whatsappNumbers?: string[] } | null
      kanbanWhatsappNumbers = client?.whatsappNumbers ?? []
      kanbanSalesReps = await listSalesReps(orgId, campaign.clientId)
    }
  }

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
      salesReps={kanbanSalesReps}
      whatsappNumbers={kanbanWhatsappNumbers}
      clientId={kanbanClientId}
    />
  )
}

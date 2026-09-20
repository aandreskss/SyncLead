import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getOrganizationByOwnerId } from "@/domains/organizations/repository"
import { getCampaignWithClientById } from "@/domains/campaigns/repository"
import { getLeadsByCampaignWithActivity } from "@/domains/leads/repository"
import { listSalesReps } from "@/domains/team/repository"
import type { LeadFilters } from "@/domains/leads/repository"
import type { Temperature, LeadStage } from "@/lib/db/schema"
import { LeadsView } from "./_components/LeadsView"

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ search?: string; temperature?: string; stage?: string; assignment?: string; repId?: string; activity?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const org = await getOrganizationByOwnerId(session.user.id)
  if (!org) redirect("/onboarding")

  const { id } = await params
  const sp = await searchParams

  const campaign = await getCampaignWithClientById(id, org.id)
  if (!campaign) redirect("/dashboard/campaigns")

  const filters: LeadFilters = {
    search: sp.search || undefined,
    temperature: (sp.temperature as Temperature) || undefined,
    stage: (sp.stage as LeadStage) || undefined,
    activity: (sp.activity as LeadFilters["activity"]) || undefined,
  }

  const [leads, salesReps] = await Promise.all([
    getLeadsByCampaignWithActivity(id, org.id, filters),
    campaign.clientId
      ? listSalesReps(org.id, campaign.clientId)
      : Promise.resolve([]),
  ])

  return (
    <LeadsView
      leads={leads}
      campaign={campaign}
      whatsappNumbers={campaign.client?.whatsappNumbers ?? []}
      orgName={org.name}
      salesReps={salesReps}
      currentUserId={session.user.id}
    />
  )
}

import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { getOrganizationById } from "@/domains/organizations/repository"
import { getCampaignWithClientById } from "@/domains/campaigns/repository"
import { getLeadsByCampaignWithActivity } from "@/domains/leads/repository"
import { listSalesReps } from "@/domains/team/repository"
import { getLeadAdSourceByCampaign } from "@/domains/lead-ads/repository"
import type { LeadFilters } from "@/domains/leads/repository"
import type { Temperature, LeadStage } from "@/lib/db/schema"
import { LeadsView } from "./_components/LeadsView"

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ search?: string; temperature?: string; stage?: string; assignment?: string; repId?: string; activity?: string; source?: string }>
}) {
  let ctx: Awaited<ReturnType<typeof requireOrganizationMembership>>
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  const org = await getOrganizationById(ctx.orgId)
  if (!org) redirect("/login")

  const { id } = await params
  const sp = await searchParams

  const campaign = await getCampaignWithClientById(id, ctx.orgId)
  if (!campaign) redirect("/dashboard/campaigns")

  const filters: LeadFilters = {
    search: sp.search || undefined,
    temperature: (sp.temperature as Temperature) || undefined,
    stage: (sp.stage as LeadStage) || undefined,
    activity: (sp.activity as LeadFilters["activity"]) || undefined,
    source: (sp.source as LeadFilters["source"]) || undefined,
  }

  const [leads, salesReps, leadAdSource] = await Promise.all([
    getLeadsByCampaignWithActivity(id, ctx.orgId, filters),
    campaign.clientId
      ? listSalesReps(ctx.orgId, campaign.clientId)
      : Promise.resolve([]),
    getLeadAdSourceByCampaign(id, ctx.orgId),
  ])

  const leadAdSourcePublic = leadAdSource
    ? { pageId: leadAdSource.pageId, formId: leadAdSource.formId, active: leadAdSource.active }
    : null

  return (
    <LeadsView
      leads={leads}
      campaign={campaign}
      whatsappNumbers={campaign.client?.whatsappNumbers ?? []}
      orgName={org.name}
      salesReps={salesReps}
      currentUserId={ctx.userId}
      leadAdSource={leadAdSourcePublic}
    />
  )
}

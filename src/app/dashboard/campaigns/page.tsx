import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { getOrganizationById } from "@/domains/organizations/repository"
import { getCampaignsWithClientAndCounts } from "@/domains/campaigns/repository"
import { getClientsByOrgId } from "@/domains/clients/repository"
import { CampaignsView } from "./_components/CampaignsView"

export default async function CampaignsPage() {
  let ctx: Awaited<ReturnType<typeof requireOrganizationMembership>>
  try {
    ctx = await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  const org = await getOrganizationById(ctx.orgId)
  if (!org) redirect("/login")

  const [campaigns, clients] = await Promise.all([
    getCampaignsWithClientAndCounts(org.id),
    getClientsByOrgId(org.id),
  ])

  return <CampaignsView campaigns={campaigns} clients={clients} orgName={org.name} />
}

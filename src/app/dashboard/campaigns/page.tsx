import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getOrganizationByOwnerId } from "@/domains/organizations/repository"
import { getCampaignsWithClientAndCounts } from "@/domains/campaigns/repository"
import { getClientsByOrgId } from "@/domains/clients/repository"
import { CampaignsView } from "./_components/CampaignsView"

export default async function CampaignsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const org = await getOrganizationByOwnerId(session.user.id)
  if (!org) redirect("/onboarding")

  const [campaigns, clients] = await Promise.all([
    getCampaignsWithClientAndCounts(org.id),
    getClientsByOrgId(org.id),
  ])

  return <CampaignsView campaigns={campaigns} clients={clients} orgName={org.name} />
}

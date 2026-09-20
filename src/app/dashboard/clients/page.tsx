import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { getOrganizationById } from "@/domains/organizations/repository"
import { getClientsByOrgId } from "@/domains/clients/repository"
import { ClientsView } from "./_components/ClientsView"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"

export default async function ClientsPage() {
  let ctx
  try {
    ctx = await requireOrganizationMembership()
  } catch (err) {
    if (err instanceof ForbiddenError) redirect("/onboarding")
    redirect("/login")
  }

  const org = await getOrganizationById(ctx.orgId)
  if (!org) redirect("/onboarding")

  const clients = await getClientsByOrgId(ctx.orgId)

  return <ClientsView clients={clients} orgName={org.name} />
}

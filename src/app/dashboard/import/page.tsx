import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { getCampaignsWithClientAndCounts } from "@/domains/campaigns/repository"
import { PageShell, PageHeader } from "@/components/app/ops"
import { ImportWizard } from "./_components/ImportWizard"

export default async function ImportPage() {
  let ctx: { orgId: string; userId: string }

  try {
    ctx = await requireRole(["owner", "admin", "manager"])
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    if (e instanceof ForbiddenError) redirect("/dashboard")
    throw e
  }

  const allCampaigns = await getCampaignsWithClientAndCounts(ctx.orgId)
  const campaigns = allCampaigns.map((c) => ({
    id: c.id,
    name: c.name,
    clientName: c.client?.name ?? "(sin cliente)",
  }))

  return (
    <PageShell className="mx-auto max-w-5xl">
      <PageHeader
        title="Importar leads"
        subtitle="Importa leads y ventas históricas desde un archivo CSV o XLSX. Las ventas importadas nunca se envían a Meta CAPI."
      />
      <ImportWizard campaigns={campaigns} />
    </PageShell>
  )
}

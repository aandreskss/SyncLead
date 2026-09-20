import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { getCampaignsWithClientAndCounts } from "@/domains/campaigns/repository"
import { ImportWizard } from "./_components/ImportWizard"

export default async function ImportPage() {
  let ctx: { orgId: string; userId: string }
  let campaigns: Array<{ id: string; name: string; clientName: string }>

  try {
    ctx = await requireRole(["owner", "admin", "manager"])
  } catch (e) {
    if (e instanceof AuthError) redirect("/login")
    if (e instanceof ForbiddenError) redirect("/dashboard")
    throw e
  }

  const allCampaigns = await getCampaignsWithClientAndCounts(ctx.orgId)
  campaigns = allCampaigns.map((c) => ({
    id: c.id,
    name: c.name,
    clientName: c.client?.name ?? "(sin cliente)",
  }))

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Importar desde Google Sheets</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Importa leads y ventas históricas desde un archivo CSV o XLSX.
          Las ventas importadas nunca se envían a Meta CAPI.
        </p>
      </div>
      <ImportWizard campaigns={campaigns} />
    </div>
  )
}

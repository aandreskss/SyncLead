import { requireRole } from "@/lib/auth/server"
import { listConfiguredProviders } from "@/domains/ai-agents/provider-keys-repository"
import { AiProvidersView } from "./_components/AiProvidersView"
import type { ProviderName } from "@/domains/ai-agents/provider-keys-repository"

export const metadata = { title: "Proveedores IA — SyncLead" }

export default async function AiProvidersPage() {
  const ctx = await requireRole(["owner", "admin"])
  const configured = await listConfiguredProviders(ctx.orgId)

  return <AiProvidersView configured={configured} />
}

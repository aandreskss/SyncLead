import { requireOrganizationMembership } from "@/lib/auth/server"
import { listInboxConversations } from "@/domains/ai-agents/inbox-repository"
import InboxView from "./_components/InboxView"

export const metadata = { title: "Bandeja — SyncLead" }

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>
}) {
  const ctx = await requireOrganizationMembership()
  const sp = await searchParams
  const filter = (sp.filter ?? "waiting_human") as Parameters<typeof listInboxConversations>[0]["filter"]
  const page = Number(sp.page ?? 1)

  const conversations = await listInboxConversations({
    orgId: ctx.orgId,
    userId: ctx.userId,
    filter,
    page,
  })

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ops-line px-6 py-4">
        <h1 className="text-lg font-semibold text-ops-tx">Bandeja</h1>
        <p className="text-sm text-ops-tx2">Conversaciones de WhatsApp de tus agentes IA.</p>
      </div>
      <InboxView
        initialConversations={conversations}
        initialFilter={filter}
        userId={ctx.userId}
      />
    </div>
  )
}

import { requireOrganizationMembership } from "@/lib/auth/server"
import { getConversationDetail } from "@/domains/ai-agents/inbox-repository"
import { notFound } from "next/navigation"
import ConversationView from "./_components/ConversationView"

export const metadata = { title: "Conversación — SyncLead" }

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const ctx = await requireOrganizationMembership()
  const { conversationId } = await params

  const detail = await getConversationDetail({
    orgId: ctx.orgId,
    conversationId,
  })

  if (!detail) notFound()

  return (
    <ConversationView
      detail={detail}
      currentUserId={ctx.userId}
      userRole={ctx.role}
    />
  )
}

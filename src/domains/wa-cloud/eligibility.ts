import "server-only"
import { db } from "@/lib/db"
import { waConversationMessages } from "@/lib/db/schema"
import { and, eq, desc } from "drizzle-orm"

// Meta Cloud API rule: free-form messages require a customer message within the last 24 hours.
// Outside this window only pre-approved templates can be sent.
const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: "window_closed" | "no_inbound_messages" }

/**
 * Checks whether a free-form text reply can be sent on this conversation.
 * Returns `eligible: false` if no inbound message exists or the last one
 * arrived more than 24 hours ago.
 *
 * Never auto-converts an AI-generated reply to a pre-approved template.
 * If this returns false, the caller must decide independently whether a
 * template send is appropriate and authorized.
 */
export async function checkSendEligibility(
  conversationId: string,
  orgId: string,
): Promise<EligibilityResult> {
  const rows = await db
    .select({ createdAt: waConversationMessages.createdAt })
    .from(waConversationMessages)
    .where(
      and(
        eq(waConversationMessages.conversationId, conversationId),
        eq(waConversationMessages.orgId, orgId),
        eq(waConversationMessages.direction, "inbound"),
      )
    )
    .orderBy(desc(waConversationMessages.createdAt))
    .limit(1)

  if (!rows[0]) return { eligible: false, reason: "no_inbound_messages" }

  const ageMs = Date.now() - rows[0].createdAt.getTime()
  if (ageMs > MESSAGING_WINDOW_MS) return { eligible: false, reason: "window_closed" }
  return { eligible: true }
}

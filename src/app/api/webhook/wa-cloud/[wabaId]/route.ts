import { verifyWebhookSignature, parseWebhookPayload } from "@/domains/wa-cloud/webhook"
import {
  resolveTenantFromPhoneNumberId,
  autoRegisterPhoneNumberFromWebhook,
  findOrCreateConversation,
  persistIncomingMessage,
  updateDeliveryStatusByWamid,
  enqueueForAiProcessing,
} from "@/domains/wa-cloud/repository"
import type { ParsedIncomingMessage, ParsedStatusUpdate } from "@/domains/wa-cloud/types"
import { MetaHubVerifySchema } from "@/domains/wa-cloud/types"
import { db } from "@/lib/db"
import { waBusinessAccounts, aiAgentDeployments } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { enqueueMediaMessage } from "@/domains/ai-agents/media/repository"

// Message types that have media content requiring async processing
const MEDIA_CONTENT_TYPES = new Set(["image", "audio", "video", "sticker", "document"])

// ─── GET — hub verification ───────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ wabaId: string }> }
) {
  const { wabaId } = await params
  const url = new URL(req.url)

  const query = MetaHubVerifySchema.safeParse({
    "hub.mode": url.searchParams.get("hub.mode"),
    "hub.verify_token": url.searchParams.get("hub.verify_token"),
    "hub.challenge": url.searchParams.get("hub.challenge"),
  })
  if (!query.success) return new Response("Bad request", { status: 400 })

  // Verify token must match the token stored for this WABA (tenant-scoped)
  const waba = await db
    .select({ webhookVerifyToken: waBusinessAccounts.webhookVerifyToken })
    .from(waBusinessAccounts)
    .where(eq(waBusinessAccounts.wabaId, wabaId))
    .limit(1)

  const storedToken = waba[0]?.webhookVerifyToken
  if (!storedToken || storedToken !== query.data["hub.verify_token"]) {
    return new Response("Forbidden", { status: 403 })
  }

  return new Response(query.data["hub.challenge"], { status: 200 })
}

// ─── POST — inbound messages and status updates ───────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ wabaId: string }> }
) {
  const { wabaId } = await params
  const rawBody = await req.text()

  console.log("[webhook-wa] POST received wabaId:", wabaId, "bodyLen:", rawBody.length)

  // HMAC verification (requires WA_CLOUD_APP_SECRET to be set)
  const appSecret = process.env.WA_CLOUD_APP_SECRET
  if (appSecret) {
    const sig = req.headers.get("x-hub-signature-256") ?? ""
    const valid = verifyWebhookSignature(rawBody, sig, appSecret)
    console.log("[webhook-wa] signature valid:", valid, "sig present:", !!sig)
    if (!valid) {
      console.log("[webhook-wa] 403 signature mismatch")
      return new Response("Signature mismatch", { status: 403 })
    }
  } else {
    console.log("[webhook-wa] no WA_CLOUD_APP_SECRET — skipping HMAC")
  }

  // Validate the WABA ID in the path belongs to a registered account
  const wabaRow = await db
    .select({ id: waBusinessAccounts.id })
    .from(waBusinessAccounts)
    .where(eq(waBusinessAccounts.wabaId, wabaId))
    .limit(1)

  if (!wabaRow[0]) {
    console.log("[webhook-wa] unknown wabaId:", wabaId, "— returning 200 (not our endpoint)")
    return new Response("OK", { status: 200 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response("Bad JSON", { status: 400 })
  }

  const rawObj = body as { object?: unknown }
  if (rawObj.object !== "whatsapp_business_account") {
    console.log("[webhook-wa] object is not whatsapp_business_account:", rawObj.object)
    return new Response("OK", { status: 200 })
  }

  console.log("[webhook-wa] processing payload for wabaId:", wabaId)
  const result = await processPayload(body).catch((err: unknown) => {
    console.log("[webhook-wa] processPayload error:", err instanceof Error ? err.message : String(err))
    return undefined
  })
  console.log("[webhook-wa] processPayload done", result)

  return new Response("OK", { status: 200 })
}

// ─── Async processing ─────────────────────────────────────────────────────────

async function processPayload(raw: unknown): Promise<void> {
  const { messages, statuses } = parseWebhookPayload(raw)
  console.log("[webhook-wa] parsed payload: messages:", messages.length, "statuses:", statuses.length)

  for (const msg of messages) {
    await processIncomingMessage(msg).catch((err: unknown) => {
      console.log("[webhook-wa] processIncomingMessage error:", err instanceof Error ? err.message : String(err))
    })
  }

  for (const stat of statuses) {
    await updateDeliveryStatusByWamid(stat).catch(() => undefined)
  }
}

async function processIncomingMessage(msg: ParsedIncomingMessage): Promise<void> {
  console.log("[webhook-wa] processing msg from:", msg.fromPhone, "to phoneId:", msg.toPhoneNumberId, "type:", msg.type)

  let tenant = await resolveTenantFromPhoneNumberId(msg.toPhoneNumberId)
  console.log("[webhook-wa] tenant resolved:", tenant ? `orgId=${tenant.orgId}` : "null")

  // Phone number not in DB yet — auto-register from webhook metadata
  if (!tenant && msg.displayPhoneNumber) {
    console.log("[webhook-wa] auto-registering phone:", msg.toPhoneNumberId, "wabaId:", msg.wabaId)
    tenant = await autoRegisterPhoneNumberFromWebhook({
      wabaExternalId: msg.wabaId,
      phoneNumberId: msg.toPhoneNumberId,
      displayPhoneNumber: msg.displayPhoneNumber,
    })
    console.log("[webhook-wa] auto-register result:", tenant ? `orgId=${tenant.orgId}` : "failed")
  }

  if (!tenant) {
    console.log("[webhook-wa] no tenant — aborting message processing")
    return
  }

  // Look up the active deployment for this phone number so new conversations
  // are linked immediately — without this the AI processor can't find the agent.
  const depRow = await db
    .select({ id: aiAgentDeployments.id })
    .from(aiAgentDeployments)
    .where(
      and(
        eq(aiAgentDeployments.phoneNumberId, tenant.phoneNumberRowId),
        eq(aiAgentDeployments.orgId, tenant.orgId),
        eq(aiAgentDeployments.active, true),
      )
    )
    .limit(1)
    .catch(() => [])

  const conversationId = await findOrCreateConversation({
    orgId: tenant.orgId,
    phoneNumberRowId: tenant.phoneNumberRowId,
    customerPhone: msg.fromPhone,
    customerName: msg.customerName,
    deploymentId: depRow[0]?.id ?? null,
  })

  const messageRowId = await persistIncomingMessage(tenant.orgId, conversationId, msg)
  if (!messageRowId) return // Duplicate wamid — already processed

  // For media messages, enqueue for async media processing (download + understand).
  // The text job will check for pending media and defer until it's done.
  if (MEDIA_CONTENT_TYPES.has(msg.type) && msg.mediaId) {
    await enqueueMediaMessage({
      orgId: tenant.orgId,
      conversationId,
      messageId: messageRowId,
      waMediaId: msg.mediaId,
      mimeType: msg.mimeType ?? "application/octet-stream",
    }).catch(() => undefined)
  }

  // Always enqueue to the text job queue (text job will block on pending media)
  await enqueueForAiProcessing({
    orgId: tenant.orgId,
    conversationId,
    incomingMessageId: messageRowId,
  })
  console.log("[webhook-wa] enqueued for AI processing conversationId:", conversationId, "msgId:", messageRowId)

  // Trigger immediate processing so the AI replies in ~5s instead of waiting for cron.
  // Fire-and-forget: errors don't affect webhook response. Cron-job.org serves as fallback.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const cronSecret = process.env.CRON_SECRET
  if (appUrl && cronSecret) {
    fetch(`${appUrl}/api/cron/ai-message-processor`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    }).catch(() => undefined)
  }
}

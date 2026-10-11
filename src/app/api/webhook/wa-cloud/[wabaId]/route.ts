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
import { waBusinessAccounts } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
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

  // HMAC verification (requires WA_CLOUD_APP_SECRET to be set)
  const appSecret = process.env.WA_CLOUD_APP_SECRET
  if (appSecret) {
    const sig = req.headers.get("x-hub-signature-256") ?? ""
    if (!verifyWebhookSignature(rawBody, sig, appSecret)) {
      return new Response("Signature mismatch", { status: 403 })
    }
  }

  // Validate the WABA ID in the path belongs to a registered account
  const wabaRow = await db
    .select({ id: waBusinessAccounts.id })
    .from(waBusinessAccounts)
    .where(eq(waBusinessAccounts.wabaId, wabaId))
    .limit(1)

  if (!wabaRow[0]) {
    // Unknown WABA — return 200 so Meta stops retrying (not our endpoint)
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
    return new Response("OK", { status: 200 })
  }

  // Respond immediately — Meta requires < 20s or it retries
  processPayload(body).catch(() => undefined)

  return new Response("OK", { status: 200 })
}

// ─── Async processing ─────────────────────────────────────────────────────────

async function processPayload(raw: unknown): Promise<void> {
  const { messages, statuses } = parseWebhookPayload(raw)

  for (const msg of messages) {
    await processIncomingMessage(msg).catch(() => undefined)
  }

  for (const stat of statuses) {
    await updateDeliveryStatusByWamid(stat).catch(() => undefined)
  }
}

async function processIncomingMessage(msg: ParsedIncomingMessage): Promise<void> {
  let tenant = await resolveTenantFromPhoneNumberId(msg.toPhoneNumberId)

  // Phone number not in DB yet — auto-register from webhook metadata
  if (!tenant && msg.displayPhoneNumber) {
    tenant = await autoRegisterPhoneNumberFromWebhook({
      wabaExternalId: msg.wabaId,
      phoneNumberId: msg.toPhoneNumberId,
      displayPhoneNumber: msg.displayPhoneNumber,
    })
  }

  if (!tenant) return

  const conversationId = await findOrCreateConversation({
    orgId: tenant.orgId,
    phoneNumberRowId: tenant.phoneNumberRowId,
    customerPhone: msg.fromPhone,
    customerName: msg.customerName,
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

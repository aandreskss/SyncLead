import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { waClientConfig, clients } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { processProviderEvent } from "@/domains/whatsapp/repository"
import type { IWhatsAppProvider, ProviderWebhookEvent } from "@/domains/whatsapp/types"
import crypto from "crypto"

// Registry of active provider implementations.
// Add future integrations here (Callbell, WhatsApp Cloud API, etc.).
const PROVIDER_REGISTRY: Map<string, IWhatsAppProvider> = new Map()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params

  // Validate clientId format
  if (!/^[0-9a-f-]{36}$/.test(clientId)) {
    return NextResponse.json({ error: "Invalid client" }, { status: 400 })
  }

  // Fetch client config to resolve org and provider
  const [cfg] = await db
    .select({
      orgId: waClientConfig.orgId,
      confirmationMode: waClientConfig.confirmationMode,
      providerName: waClientConfig.providerName,
      webhookSecretHash: waClientConfig.webhookSecretHash,
    })
    .from(waClientConfig)
    .where(eq(waClientConfig.clientId, clientId))
    .limit(1)

  if (!cfg) {
    // Return 200 to avoid leaking whether client exists
    return NextResponse.json({ ok: true })
  }

  if (cfg.confirmationMode !== "provider") {
    return NextResponse.json({ ok: true })
  }

  const provider = cfg.providerName ? PROVIDER_REGISTRY.get(cfg.providerName) : null
  if (!provider) {
    // Provider not implemented yet — accept and discard gracefully
    return NextResponse.json({ ok: true })
  }

  // Read raw body for signature verification
  const rawBody = await request.text()
  const signature = request.headers.get("x-hub-signature-256") ??
    request.headers.get("x-signature") ??
    request.headers.get("x-callbell-signature") ??
    ""

  // Verify signature if we have the secret hash
  if (cfg.webhookSecretHash) {
    // The webhook secret is stored as a SHA-256 hash; real verification uses HMAC
    // with the original plaintext secret. Since we only store the hash here (no
    // plaintext stored), signature verification requires the plaintext to be passed
    // through env. This is a placeholder for when real secrets are stored encrypted.
    const isValid = provider.verifySignature(rawBody, signature, cfg.webhookSecretHash)
    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
  }

  let raw: unknown
  try {
    raw = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const event: ProviderWebhookEvent | null = provider.parseWebhook(raw)
  if (!event) {
    return NextResponse.json({ ok: true })
  }

  try {
    await processProviderEvent({
      orgId: cfg.orgId,
      clientId,
      providerName: provider.name,
      event,
    })
  } catch {
    // Internal error — return 500 so provider retries
    return NextResponse.json({ error: "Processing error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

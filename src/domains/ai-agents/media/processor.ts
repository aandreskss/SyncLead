import "server-only"
import { put } from "@vercel/blob"
import { decryptTokenVersioned } from "@/lib/crypto"
import { assertMediaUrlAllowed, MediaUrlNotAllowedError } from "./allowlist"
import { isImageMime, isAudioMime, MAX_MEDIA_SIZE_BYTES, MAX_VISION_TOKENS } from "./types"
import type Anthropic from "@anthropic-ai/sdk"

// ─── Meta media download ──────────────────────────────────────────────────────

/**
 * Download media from Meta's Graph API using the token held in the WABA record.
 * Only URLs that pass the allowlist are fetched (SSRF guard).
 */
export async function downloadMetaMedia(params: {
  waMediaId: string
  accessTokenEnc: string
  keyVersion: number
  orgId: string
}): Promise<{ buffer: Buffer; contentType: string; sizeBytes: number }> {
  // keyVersion is embedded in the ciphertext prefix (v{n}:...) — no need to pass separately
  const accessToken = decryptTokenVersioned(params.accessTokenEnc)

  // Step 1: resolve the download URL from the media ID
  const metaUrlResp = await fetch(
    `https://graph.facebook.com/v19.0/${params.waMediaId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!metaUrlResp.ok) {
    const err = await metaUrlResp.text().catch(() => metaUrlResp.statusText)
    throw new Error(`META_MEDIA_URL_FAILED: ${metaUrlResp.status} ${err}`)
  }

  const metaJson: { url?: string } = await metaUrlResp.json()
  const downloadUrl = metaJson.url
  if (!downloadUrl) throw new Error("META_MEDIA_URL_MISSING: no url in response")

  // Allowlist check before fetching
  assertMediaUrlAllowed(downloadUrl)

  // Step 2: download the actual file
  const fileResp = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!fileResp.ok) {
    throw new Error(`META_MEDIA_DOWNLOAD_FAILED: ${fileResp.status} ${fileResp.statusText}`)
  }

  const contentType = fileResp.headers.get("content-type") ?? "application/octet-stream"

  // Read with a size guard to prevent OOM on unexpectedly large responses
  const reader = fileResp.body?.getReader()
  if (!reader) throw new Error("META_MEDIA_NO_BODY")

  let received = 0
  const chunks: Uint8Array[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > MAX_MEDIA_SIZE_BYTES) {
      await reader.cancel()
      throw new Error(`MEDIA_TOO_LARGE: ${received} bytes exceeds ${MAX_MEDIA_SIZE_BYTES}`)
    }
    chunks.push(value)
  }

  const buffer = Buffer.concat(chunks)
  return { buffer, contentType, sizeBytes: buffer.byteLength }
}

// ─── Vercel Blob storage ──────────────────────────────────────────────────────

export async function storeMediaBlob(params: {
  orgId: string
  waMediaId: string
  buffer: Buffer
  contentType: string
}): Promise<string> {
  const blobPath = `media/${params.orgId}/${params.waMediaId}`
  const blob = await put(blobPath, params.buffer, {
    access: "private",
    contentType: params.contentType,
  })
  return blob.url
}

// ─── Claude Vision (image understanding) ─────────────────────────────────────

/**
 * Send the image to Claude Vision and return a description.
 * Treated as UNTRUSTED USER CONTENT — the description is stored for context only;
 * it is never injected as a system instruction.
 */
export async function describeImage(params: {
  buffer: Buffer
  mimeType: string
  anthropicClient: Anthropic
}): Promise<{ description: string; tokensUsed: number }> {
  const base64 = params.buffer.toString("base64")

  const msg = await params.anthropicClient.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: MAX_VISION_TOKENS,
    system:
      "Describe the contents of this image in one or two sentences. " +
      "Be factual and concise. If it appears to be a payment receipt or screenshot, " +
      "describe what you see but note that you cannot verify authenticity.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: params.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: base64,
            },
          },
          { type: "text", text: "Describe this image." },
        ],
      },
    ],
  })

  const description = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim()

  const tokensUsed = (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0)
  return { description, tokensUsed }
}

// ─── Process one media job ────────────────────────────────────────────────────

export interface MediaProcessResult {
  status: "done" | "unsupported"
  storageKey?: string
  sizeBytes?: number
  imageDescription?: string
  transcriptionText?: string
  mediaTokensUsed?: number
  unsupportedReason?: string
}

/**
 * Full lifecycle for one media queue item:
 * 1. Download from Meta (authenticated, allowlisted)
 * 2. Store to Vercel Blob (private)
 * 3. If image → describe via Claude Vision
 * 4. If audio → return unsupported (route to human)
 */
export async function processMediaItem(params: {
  waMediaId: string
  mimeType: string
  orgId: string
  accessTokenEnc: string
  keyVersion: number
  anthropicClient: Anthropic
}): Promise<MediaProcessResult> {
  // Audio: not supported for automatic transcription in Phase 10
  if (isAudioMime(params.mimeType)) {
    return {
      status: "unsupported",
      unsupportedReason: "audio_transcription_not_supported",
    }
  }

  // Download
  const { buffer, contentType, sizeBytes } = await downloadMetaMedia({
    waMediaId: params.waMediaId,
    accessTokenEnc: params.accessTokenEnc,
    keyVersion: params.keyVersion,
    orgId: params.orgId,
  })

  // Store
  const storageKey = await storeMediaBlob({
    orgId: params.orgId,
    waMediaId: params.waMediaId,
    buffer,
    contentType,
  })

  // If image → describe
  if (isImageMime(params.mimeType)) {
    const { description, tokensUsed } = await describeImage({
      buffer,
      mimeType: params.mimeType,
      anthropicClient: params.anthropicClient,
    })

    return {
      status: "done",
      storageKey,
      sizeBytes,
      imageDescription: description,
      mediaTokensUsed: tokensUsed,
    }
  }

  // Other media types (video, sticker) — store only, no understanding
  return { status: "done", storageKey, sizeBytes }
}

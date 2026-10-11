/**
 * Permitted Media download hostnames.
 *
 * Only URLs from Meta's official CDN hostnames are allowed.
 * This prevents SSRF attacks where a user-crafted payload could cause the
 * server to download from arbitrary internal or external URLs.
 *
 * The list is intentionally conservative — add hostnames only after verifying
 * they are authoritative Meta media endpoints.
 */
const ALLOWED_HOSTNAMES = new Set([
  "lookaside.fbsbx.com",
  "mmg.whatsapp.net",
  "graph.facebook.com",
  "scontent.whatsapp.net",
])

export class MediaUrlNotAllowedError extends Error {
  constructor(url: string) {
    super(`MEDIA_URL_NOT_ALLOWED: ${url}`)
    this.name = "MediaUrlNotAllowedError"
  }
}

/**
 * Validate that a URL belongs to an allowed Meta CDN hostname.
 * Throws MediaUrlNotAllowedError if the URL is not on the allowlist.
 */
export function assertMediaUrlAllowed(rawUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new MediaUrlNotAllowedError(rawUrl)
  }

  if (!ALLOWED_HOSTNAMES.has(parsed.hostname)) {
    throw new MediaUrlNotAllowedError(rawUrl)
  }

  return parsed
}

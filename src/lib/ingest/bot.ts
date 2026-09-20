import "server-only"

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
const MIN_SUBMIT_MS = 3_000 // Humans take at least 3 seconds to fill a form

/**
 * Verifies a Cloudflare Turnstile token server-side.
 * Returns true (passes) when TURNSTILE_SECRET_KEY is not configured — bot
 * protection is optional; callers must decide whether to hard-fail or log.
 */
export async function verifyTurnstile(
  token: string | undefined,
  remoteIp?: string | null
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true // Not configured — skip check

  if (!token) return false

  try {
    const body = new URLSearchParams({ secret, response: token })
    if (remoteIp) body.set("remoteip", remoteIp)

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
    if (!res.ok) return false
    const data = (await res.json()) as { success: boolean }
    return data.success === true
  } catch {
    return false
  }
}

/**
 * Checks the honeypot field. Returns true if the submission passes (field is empty).
 * Bots tend to fill all visible fields including hidden ones.
 */
export function checkHoneypot(value: string | undefined): boolean {
  return value === undefined || value === ""
}

/**
 * Checks minimum form submission time. Returns true if the submission passes.
 * A submission faster than MIN_SUBMIT_MS is almost certainly automated.
 */
export function checkSubmitTime(ts: number | undefined, minMs = MIN_SUBMIT_MS): boolean {
  if (ts === undefined || ts === null) return true // Not enforced if field absent
  const elapsed = Date.now() - ts
  return elapsed >= minMs
}

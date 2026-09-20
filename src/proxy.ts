import { auth } from "@/auth"
import { NextResponse } from "next/server"

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https:",
    "upgrade-insecure-requests",
  ].join("; ")
}

// Headers applied to every response regardless of route
function applySecurityHeaders(res: NextResponse, csp: string): void {
  res.headers.set("Content-Security-Policy", csp)
  res.headers.set("X-Frame-Options", "DENY")
  res.headers.set("X-Content-Type-Options", "nosniff")
  res.headers.set("X-XSS-Protection", "1; mode=block")
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  res.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()"
  )
  // HSTS: only in production to avoid breaking local dev
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
  }
}

export default auth((req) => {
  const nonce = btoa(crypto.randomUUID())
  const csp = buildCsp(nonce)

  const isAuthenticated = !!req.auth
  const { pathname } = req.nextUrl

  const isProtected = pathname.startsWith("/dashboard")
  const isAuthRoute = pathname === "/login" || pathname === "/register"

  if (isProtected && !isAuthenticated) {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    const res = NextResponse.redirect(url)
    applySecurityHeaders(res, csp)
    return res
  }

  if (isAuthRoute && isAuthenticated) {
    const url = req.nextUrl.clone()
    url.pathname = "/dashboard"
    const res = NextResponse.redirect(url)
    applySecurityHeaders(res, csp)
    return res
  }

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-nonce", nonce)

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  applySecurityHeaders(res, csp)
  return res
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}

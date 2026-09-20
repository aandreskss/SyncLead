import { handlers } from "@/auth"
import { Ratelimit } from "@upstash/ratelimit"
import { getRedis } from "@/lib/redis"
import { NextRequest, NextResponse } from "next/server"

const redis = getRedis()
const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 m"),
      prefix: "ratelimit:auth",
    })
  : null

async function withRateLimit(
  req: NextRequest,
  handler: (req: NextRequest) => Promise<Response>
): Promise<Response> {
  if (ratelimit) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anonymous"
    const { success } = await ratelimit.limit(ip)
    if (!success) {
      return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 })
    }
  }
  return handler(req)
}

export async function GET(req: NextRequest) {
  return withRateLimit(req, handlers.GET)
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, handlers.POST)
}

import { ImageResponse } from "next/og"
import { getPostBySlug } from "@/lib/blog"

export const runtime = "nodejs"
export const alt = "Blog — SyncLead"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function OGImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)

  const title = post?.title ?? "Blog — SyncLead"
  const description = post?.description ?? "CRM de leads para Meta Ads"

  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #18181b 0%, #1e1b4b 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "64px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Blog tag */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              background: "#4f46e5",
              color: "#fff",
              fontSize: 16,
              fontWeight: 600,
              padding: "6px 16px",
              borderRadius: 99,
            }}
          >
            Blog SyncLead
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: title.length > 60 ? 44 : 52,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.15,
            maxWidth: 900,
            marginBottom: 24,
            letterSpacing: -1,
          }}
        >
          {title}
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 22,
            color: "#a1a1aa",
            maxWidth: 800,
            lineHeight: 1.5,
          }}
        >
          {description.length > 120 ? `${description.slice(0, 120)}…` : description}
        </div>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: 80,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              background: "#4f46e5",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: 18, height: 18, background: "#fff", borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>SyncLead</span>
        </div>
      </div>
    ),
    { ...size }
  )
}

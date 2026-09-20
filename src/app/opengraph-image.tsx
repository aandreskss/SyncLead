import { ImageResponse } from "next/og"

export const runtime = "nodejs"
export const alt = "SyncLead — CRM de leads para Meta Ads"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #18181b 0%, #1e1b4b 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          gap: 0,
        }}
      >
        {/* Logo row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
          <div
            style={{
              width: 56,
              height: 56,
              background: "#4f46e5",
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: 28, height: 28, background: "#fff", borderRadius: 4, display: "flex" }} />
          </div>
          <div style={{ fontSize: 48, fontWeight: 700, color: "#fff", letterSpacing: -2, display: "flex" }}>
            SyncLead
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: "#fff",
            textAlign: "center",
            lineHeight: 1.1,
            maxWidth: 900,
            marginBottom: 24,
            letterSpacing: -2,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex" }}>CRM de leads para&nbsp;</div>
          <div style={{ display: "flex", color: "#818cf8" }}>Meta Ads</div>
        </div>

        {/* Subline */}
        <div
          style={{
            fontSize: 26,
            color: "#a1a1aa",
            textAlign: "center",
            maxWidth: 700,
            display: "flex",
          }}
        >
          Captura, organiza y convierte leads de Facebook e Instagram
        </div>

        {/* Badge */}
        <div
          style={{
            marginTop: 48,
            background: "#4f46e5",
            color: "#fff",
            fontSize: 22,
            fontWeight: 600,
            padding: "12px 32px",
            borderRadius: 99,
            display: "flex",
          }}
        >
          synclead.app
        </div>
      </div>
    ),
    { ...size }
  )
}

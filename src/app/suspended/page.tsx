import Link from "next/link"

export const metadata = { title: "Cuenta suspendida · SyncLead" }

export default function SuspendedPage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#09090b",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: 24,
    }}>
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "#3b1a1a", border: "1px solid #7f1d1d",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 24px",
          fontSize: 24,
        }}>⊘</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f4f4f5", margin: "0 0 12px" }}>
          Cuenta suspendida
        </h1>
        <p style={{ fontSize: 14, color: "#71717a", lineHeight: 1.6, margin: "0 0 32px" }}>
          Tu organización ha sido suspendida temporalmente. Contacta al soporte de SyncLead para más información.
        </p>
        <Link
          href="/login"
          style={{
            display: "inline-block",
            padding: "10px 24px",
            borderRadius: 8,
            border: "1px solid #3f3f46",
            background: "#18181b",
            color: "#a1a1aa",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}

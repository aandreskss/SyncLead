import Link from "next/link"
import { getAllOrgsWithStats } from "@/lib/admin/repository"

const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
  free: { bg: "#27272a", text: "#a1a1aa" },
  starter: { bg: "#1e3a5f", text: "#93c5fd" },
  pro: { bg: "#14532d", text: "#86efac" },
  enterprise: { bg: "#3b1f6e", text: "#c4b5fd" },
}

function PlanBadge({ plan }: { plan: string }) {
  const c = PLAN_COLORS[plan] ?? PLAN_COLORS.free
  return (
    <span style={{
      background: c.bg, color: c.text,
      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
      textTransform: "uppercase", letterSpacing: "0.06em",
    }}>{plan}</span>
  )
}

export default async function AdminPage() {
  const orgs = await getAllOrgsWithStats()

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f4f4f5", margin: "0 0 4px" }}>
          Organizaciones
        </h1>
        <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>
          {orgs.length} org{orgs.length !== 1 ? "s" : ""} registradas en SyncLead
        </p>
      </div>

      <div style={{
        background: "#18181b",
        border: "1px solid #27272a",
        borderRadius: 12,
        overflow: "hidden",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #27272a" }}>
              {["Organización", "Plan", "Miembros", "Estado", "Creada", ""].map(h => (
                <th key={h} style={{
                  padding: "10px 16px", textAlign: "left",
                  fontSize: 11, fontWeight: 600, color: "#71717a",
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  background: "#0f0f12",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orgs.map((org, i) => (
              <tr key={org.id} style={{
                borderBottom: i < orgs.length - 1 ? "1px solid #1f1f23" : "none",
              }}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ fontWeight: 600, color: "#f4f4f5" }}>{org.name}</div>
                  <div style={{ fontSize: 11, color: "#52525b", marginTop: 2 }}>/{org.slug}</div>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <PlanBadge plan={org.plan} />
                </td>
                <td style={{ padding: "12px 16px", color: "#a1a1aa" }}>{org.memberCount}</td>
                <td style={{ padding: "12px 16px" }}>
                  {org.suspended ? (
                    <span style={{ fontSize: 12, color: "#f87171", fontWeight: 500 }}>⊘ Suspendida</span>
                  ) : (
                    <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 500 }}>✓ Activa</span>
                  )}
                </td>
                <td style={{ padding: "12px 16px", color: "#52525b", fontSize: 12 }}>
                  {new Date(org.createdAt).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <Link href={`/admin/orgs/${org.id}`} style={{
                    fontSize: 12, color: "#a1a1aa", textDecoration: "none",
                    border: "1px solid #3f3f46", borderRadius: 6, padding: "4px 12px",
                  }}>
                    Gestionar →
                  </Link>
                </td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#52525b" }}>
                  No hay organizaciones registradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

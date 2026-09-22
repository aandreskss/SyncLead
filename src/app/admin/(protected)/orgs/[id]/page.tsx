import { notFound } from "next/navigation"
import Link from "next/link"
import { getOrgForAdmin, getOrgMembersForAdmin, getOrgStatsForAdmin } from "@/lib/admin/repository"
import { OrgActionsPanel } from "./_components/OrgActionsPanel"

export default async function AdminOrgPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [org, members, stats] = await Promise.all([
    getOrgForAdmin(id),
    getOrgMembersForAdmin(id),
    getOrgStatsForAdmin(id),
  ])

  if (!org) notFound()

  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/admin" style={{ color: "#71717a", textDecoration: "none", fontSize: 13 }}>
          ← Organizaciones
        </Link>
        <span style={{ color: "#3f3f46" }}>/</span>
        <span style={{ color: "#a1a1aa", fontSize: 13 }}>{org.name}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>
        {/* Left col — info + members */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Stats */}
          <div style={{
            background: "#18181b", border: "1px solid #27272a", borderRadius: 12, padding: 24,
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f4f4f5", margin: "0 0 20px" }}>
              {org.name}
              {org.suspended && (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: "#f87171",
                  background: "#3b1a1a", border: "1px solid #7f1d1d",
                  borderRadius: 4, padding: "2px 8px", marginLeft: 10,
                }}>SUSPENDIDA</span>
              )}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {[
                { label: "Plan", value: org.plan.toUpperCase() },
                { label: "Miembros", value: members.length },
                { label: "Campañas", value: stats.campaigns },
                { label: "Leads", value: stats.leads.toLocaleString() },
              ].map((s) => (
                <div key={s.label} style={{
                  background: "#0f0f12", borderRadius: 8, padding: "12px 16px",
                }}>
                  <div style={{ fontSize: 11, color: "#71717a", marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#f4f4f5" }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, fontSize: 12, color: "#52525b" }}>
              Slug: <code style={{ color: "#a1a1aa" }}>/{org.slug}</code>
              {" · "}
              ID: <code style={{ color: "#a1a1aa", fontSize: 11 }}>{org.id}</code>
              {" · "}
              Creada: {new Date(org.createdAt).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}
            </div>
          </div>

          {/* Members table */}
          <div style={{
            background: "#18181b", border: "1px solid #27272a", borderRadius: 12, overflow: "hidden",
          }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #27272a" }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "#f4f4f5", margin: 0 }}>
                Miembros ({members.length})
              </h3>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#0f0f12" }}>
                  {["Email", "Nombre", "Rol", "Unido"].map((h) => (
                    <th key={h} style={{
                      padding: "8px 16px", textAlign: "left",
                      fontSize: 11, fontWeight: 600, color: "#71717a",
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.userId} style={{
                    borderTop: "1px solid #1f1f23",
                  }}>
                    <td style={{ padding: "10px 16px", color: "#a1a1aa" }}>{m.email}</td>
                    <td style={{ padding: "10px 16px", color: "#f4f4f5" }}>{m.name ?? "—"}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                        background: m.role === "owner" ? "#1c1917" : "#18181b",
                        color: m.role === "owner" ? "#f97316" : "#71717a",
                        border: `1px solid ${m.role === "owner" ? "#7c2d12" : "#27272a"}`,
                      }}>{m.role}</span>
                    </td>
                    <td style={{ padding: "10px 16px", color: "#52525b", fontSize: 12 }}>
                      {new Date(m.createdAt).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right col — actions */}
        <OrgActionsPanel
          orgId={org.id}
          currentPlan={org.plan}
          suspended={org.suspended}
          features={(org.features ?? {}) as Record<string, boolean>}
        />
      </div>
    </div>
  )
}

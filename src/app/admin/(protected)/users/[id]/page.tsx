import { notFound } from "next/navigation"
import Link from "next/link"
import { getUserWithDetailsForAdmin } from "@/lib/admin/repository"
import { UserManagePanel } from "../_components/UserManagePanel"

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUserWithDetailsForAdmin(id)
  if (!user) notFound()

  const providers = user.linkedAccounts.map((a) => a.provider)

  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/admin/users" style={{ color: "#71717a", textDecoration: "none", fontSize: 13 }}>
          ← Usuarios
        </Link>
        <span style={{ color: "#3f3f46" }}>/</span>
        <span style={{ color: "#a1a1aa", fontSize: 13 }}>{user.email}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>

        {/* Info */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{
            background: "#18181b", border: "1px solid #27272a", borderRadius: 12, padding: 24,
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#f4f4f5", margin: "0 0 20px" }}>
              Información de cuenta
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Email", value: user.email },
                { label: "Nombre", value: user.name ?? "—" },
                { label: "ID", value: <code style={{ fontSize: 11, color: "#71717a" }}>{user.id}</code> },
                {
                  label: "Email verificado",
                  value: user.emailVerified
                    ? <span style={{ color: "#4ade80" }}>✓ {new Date(user.emailVerified).toLocaleDateString("es")}</span>
                    : <span style={{ color: "#71717a" }}>No verificado</span>,
                },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", gap: 12, fontSize: 13 }}>
                  <div style={{ width: 140, color: "#71717a", flexShrink: 0 }}>{row.label}</div>
                  <div style={{ color: "#f4f4f5" }}>{row.value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #27272a" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#71717a", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Métodos de autenticación
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {user.hasPassword && (
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
                    background: "#1c2f1e", color: "#86efac", border: "1px solid #166534",
                  }}>✓ Contraseña</span>
                )}
                {providers.map((p) => (
                  <span key={p} style={{
                    fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
                    background: "#1c1f35", color: "#93c5fd", border: "1px solid #1e3a5f",
                    textTransform: "capitalize",
                  }}>{p}</span>
                ))}
                {!user.hasPassword && providers.length === 0 && (
                  <span style={{ fontSize: 12, color: "#71717a" }}>Sin métodos configurados</span>
                )}
              </div>
            </div>
          </div>

          {/* Orgs */}
          {user.memberships.length > 0 && (
            <div style={{
              background: "#18181b", border: "1px solid #27272a", borderRadius: 12, overflow: "hidden",
            }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #27272a" }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#f4f4f5", margin: 0 }}>
                  Organizaciones
                </h3>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {user.memberships.map((m) => (
                    <tr key={m.orgId} style={{ borderTop: "1px solid #1f1f23" }}>
                      <td style={{ padding: "10px 16px" }}>
                        <div style={{ color: "#f4f4f5", fontWeight: 500 }}>{m.orgName}</div>
                        <div style={{ fontSize: 11, color: "#52525b", marginTop: 1 }}>
                          {m.role} · {m.orgPlan}
                          {m.orgSuspended && <span style={{ color: "#f87171", marginLeft: 6 }}>suspendida</span>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right" }}>
                        <Link
                          href={`/admin/orgs/${m.orgId}`}
                          style={{
                            fontSize: 12, color: "#71717a", textDecoration: "none",
                            border: "1px solid #3f3f46", borderRadius: 6, padding: "3px 10px",
                          }}
                        >
                          Ver org →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Actions panel */}
        <UserManagePanel
          userId={user.id}
          userEmail={user.email ?? ""}
          hasPassword={user.hasPassword}
          hasOrgs={user.memberships.length > 0}
        />
      </div>
    </div>
  )
}

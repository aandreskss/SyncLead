import Link from "next/link"
import { searchUsersByEmail } from "@/lib/admin/repository"

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const users = q ? await searchUsersByEmail(q) : []

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f4f4f5", margin: "0 0 4px" }}>
          Usuarios
        </h1>
        <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>
          Busca por email para gestionar una cuenta
        </p>
      </div>

      {/* Search form */}
      <form method="GET" style={{ marginBottom: 24, display: "flex", gap: 10 }}>
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="email@ejemplo.com"
          autoFocus
          style={{
            flex: 1, maxWidth: 400,
            background: "#18181b", border: "1px solid #3f3f46",
            borderRadius: 8, padding: "9px 14px",
            color: "#f4f4f5", fontSize: 13, outline: "none",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "9px 20px", borderRadius: 8,
            background: "#27272a", border: "1px solid #3f3f46",
            color: "#a1a1aa", fontSize: 13, cursor: "pointer",
          }}
        >
          Buscar
        </button>
      </form>

      {/* Results */}
      {q && users.length === 0 && (
        <div style={{
          background: "#18181b", border: "1px solid #27272a",
          borderRadius: 12, padding: 40, textAlign: "center",
          color: "#52525b", fontSize: 13,
        }}>
          No se encontraron usuarios con "{q}"
        </div>
      )}

      {users.length > 0 && (
        <div style={{
          background: "#18181b", border: "1px solid #27272a",
          borderRadius: 12, overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#0f0f12" }}>
                {["Email", "Nombre", "Auth", ""].map((h) => (
                  <th key={h} style={{
                    padding: "10px 16px", textAlign: "left",
                    fontSize: 11, fontWeight: 600, color: "#71717a",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} style={{ borderTop: i > 0 ? "1px solid #1f1f23" : "none" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ color: "#f4f4f5", fontWeight: 500 }}>{u.email}</div>
                    <div style={{ fontSize: 11, color: "#52525b", marginTop: 2, fontFamily: "monospace" }}>
                      {u.id.slice(0, 18)}…
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#a1a1aa" }}>{u.name ?? "—"}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {u.hasPassword && (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                          background: "#1c2f1e", color: "#86efac", border: "1px solid #166534",
                        }}>Contraseña</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <Link
                      href={`/admin/users/${u.id}`}
                      style={{
                        fontSize: 12, color: "#a1a1aa", textDecoration: "none",
                        border: "1px solid #3f3f46", borderRadius: 6, padding: "4px 12px",
                      }}
                    >
                      Gestionar →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

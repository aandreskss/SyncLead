import Link from "next/link"
import { getAllUsersWithProviders } from "@/lib/admin/repository"

const PROVIDER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  google:      { bg: "#1c1f35", text: "#93c5fd", border: "#1e3a5f" },
  credentials: { bg: "#1c2f1e", text: "#86efac", border: "#166534" },
}

function AuthBadge({ label, type }: { label: string; type: string }) {
  const c = PROVIDER_COLORS[type] ?? { bg: "#27272a", text: "#a1a1aa", border: "#3f3f46" }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      textTransform: "capitalize",
    }}>{label}</span>
  )
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const users = await getAllUsersWithProviders(q)

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f4f4f5", margin: "0 0 4px" }}>
          Usuarios
        </h1>
        <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>
          {users.length} usuario{users.length !== 1 ? "s" : ""}{q ? ` para "${q}"` : " registrados en SyncLead"}
        </p>
      </div>

      <form method="GET" style={{ marginBottom: 20, display: "flex", gap: 10 }}>
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por email…"
          style={{
            flex: 1, maxWidth: 360,
            background: "#18181b", border: "1px solid #3f3f46",
            borderRadius: 8, padding: "8px 14px",
            color: "#f4f4f5", fontSize: 13, outline: "none",
          }}
        />
        <button type="submit" style={{
          padding: "8px 18px", borderRadius: 8,
          background: "#27272a", border: "1px solid #3f3f46",
          color: "#a1a1aa", fontSize: 13, cursor: "pointer",
        }}>Buscar</button>
        {q && (
          <Link href="/admin/users" style={{
            padding: "8px 14px", borderRadius: 8,
            border: "1px solid #3f3f46", color: "#71717a",
            fontSize: 13, textDecoration: "none", display: "flex", alignItems: "center",
          }}>✕</Link>
        )}
      </form>

      <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #27272a" }}>
              {["Usuario", "Nombre", "Auth", "Verificado", ""].map(h => (
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
            {users.map((u, i) => (
              <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? "1px solid #1f1f23" : "none" }}>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ fontWeight: 600, color: "#f4f4f5" }}>{u.email ?? "—"}</div>
                  <div style={{ fontSize: 11, color: "#52525b", marginTop: 2, fontFamily: "monospace" }}>
                    {u.id.slice(0, 20)}…
                  </div>
                </td>
                <td style={{ padding: "12px 16px", color: "#a1a1aa" }}>{u.name ?? "—"}</td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {u.hasPassword && <AuthBadge label="Contraseña" type="credentials" />}
                    {u.providers.map(p => <AuthBadge key={p} label={p} type={p} />)}
                    {!u.hasPassword && u.providers.length === 0 && (
                      <span style={{ fontSize: 11, color: "#52525b" }}>Sin auth</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  {u.emailVerified
                    ? <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 500 }}>✓ Verificado</span>
                    : <span style={{ fontSize: 12, color: "#71717a" }}>Pendiente</span>}
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <Link href={`/admin/users/${u.id}`} style={{
                    fontSize: 12, color: "#a1a1aa", textDecoration: "none",
                    border: "1px solid #3f3f46", borderRadius: 6, padding: "4px 12px",
                  }}>Gestionar →</Link>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#52525b" }}>
                  {q ? `No hay usuarios que coincidan con "${q}"` : "No hay usuarios registrados"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

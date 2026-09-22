"use client"

import { useActionState } from "react"
import { adminLoginAction } from "./actions"

export default function AdminLoginPage() {
  const [state, action, isPending] = useActionState(adminLoginAction, null)

  return (
    <div style={{
      minHeight: "100vh",
      background: "#09090b",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 380,
        padding: "0 20px",
      }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48, height: 48,
            background: "linear-gradient(135deg, #ef4444, #b91c1c)",
            borderRadius: 12,
            fontSize: 18, fontWeight: 800,
            color: "#fff",
            marginBottom: 16,
          }}>A</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f4f4f5", margin: "0 0 4px" }}>
            Panel de Administración
          </h1>
          <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>SyncLead · Acceso restringido</p>
        </div>

        {/* Form */}
        <form action={action} style={{
          background: "#18181b",
          border: "1px solid #27272a",
          borderRadius: 12,
          padding: "24px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#a1a1aa", marginBottom: 6 }}>
              Contraseña de administrador
            </label>
            <input
              type="password"
              name="password"
              autoFocus
              required
              style={{
                width: "100%",
                height: 40,
                background: "#09090b",
                border: `1px solid ${state?.error ? "#ef4444" : "#3f3f46"}`,
                borderRadius: 8,
                padding: "0 12px",
                fontSize: 14,
                color: "#f4f4f5",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {state?.error && (
              <p style={{ fontSize: 12, color: "#f87171", marginTop: 6 }}>{state.error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isPending}
            style={{
              width: "100%",
              height: 40,
              background: isPending ? "#374151" : "linear-gradient(135deg, #ef4444, #b91c1c)",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: isPending ? "not-allowed" : "pointer",
            }}
          >
            {isPending ? "Verificando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  )
}

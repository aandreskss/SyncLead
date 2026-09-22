"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { setUserPasswordAction, deleteUserAction } from "@/app/admin/(protected)/_actions"

interface Props {
  userId: string
  userEmail: string
  hasPassword: boolean
  hasOrgs: boolean
}

export function UserManagePanel({ userId, userEmail, hasPassword, hasOrgs }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function notify(msg: string) {
    setSuccess(msg)
    setError(null)
    setTimeout(() => setSuccess(null), 4000)
  }

  function handleSetPassword() {
    if (!password) { setError("Escribe una contraseña"); return }
    startTransition(async () => {
      try {
        const r = await setUserPasswordAction(userId, password)
        if (r.error) setError(r.error)
        else { notify("Contraseña establecida. El usuario puede iniciar sesión con email + contraseña."); setPassword(""); router.refresh() }
      } catch { setError("Error al establecer la contraseña") }
    })
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        const r = await deleteUserAction(userId)
        if (r.error) { setError(r.error); setConfirmDelete(false) }
        else router.push("/admin/users")
      } catch { setError("Error al eliminar el usuario") }
    })
  }

  const card: React.CSSProperties = {
    background: "#18181b", border: "1px solid #27272a", borderRadius: 12, padding: 20,
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {error && (
        <div style={{
          background: "#3b1a1a", border: "1px solid #7f1d1d",
          borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13,
        }}>{error}</div>
      )}
      {success && (
        <div style={{
          background: "#14251a", border: "1px solid #166534",
          borderRadius: 8, padding: "10px 14px", color: "#86efac", fontSize: 13,
        }}>{success}</div>
      )}

      {/* Set password */}
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#71717a", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Establecer contraseña
        </div>
        <p style={{ fontSize: 12, color: "#52525b", margin: "0 0 14px", lineHeight: 1.5 }}>
          {hasPassword
            ? "El usuario ya tiene contraseña. Puedes reemplazarla."
            : "El usuario solo tiene Google. Establece una contraseña para que pueda iniciar sesión con email."}
        </p>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
            placeholder="Nueva contraseña (mín. 8 chars)"
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#09090b", border: "1px solid #3f3f46",
              borderRadius: 8, padding: "8px 36px 8px 12px",
              color: "#f4f4f5", fontSize: 13, outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              color: "#52525b", fontSize: 14, padding: 0,
            }}
          >
            {showPassword ? "🙈" : "👁"}
          </button>
        </div>
        <button
          onClick={handleSetPassword}
          disabled={pending || !password}
          style={{
            width: "100%", padding: "9px 14px", borderRadius: 8,
            background: "#1e1b4b", border: "1px solid #4338ca",
            color: "#a5b4fc", fontSize: 13, fontWeight: 600,
            cursor: pending || !password ? "not-allowed" : "pointer",
            opacity: pending || !password ? 0.5 : 1,
          }}
        >
          {pending ? "Guardando…" : "Establecer contraseña"}
        </button>
      </div>

      {/* Delete user */}
      <div style={{ ...card, border: "1px solid #3b1a1a" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#f87171", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Zona peligrosa
        </div>
        <p style={{ fontSize: 12, color: "#71717a", margin: "0 0 14px", lineHeight: 1.5 }}>
          Eliminar <strong style={{ color: "#a1a1aa" }}>{userEmail}</strong> de forma permanente.
          {hasOrgs && (
            <span style={{ color: "#f87171" }}> Esto también eliminará su organización y TODOS sus datos (leads, campañas, ventas).</span>
          )}
        </p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            style={{
              width: "100%", padding: "9px 14px", borderRadius: 8,
              background: "#3b1a1a", border: "1px solid #7f1d1d",
              color: "#f87171", fontSize: 13, fontWeight: 600,
              cursor: "pointer", opacity: pending ? 0.5 : 1,
            }}
          >
            Eliminar usuario
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 12, color: "#f87171", margin: 0, fontWeight: 600 }}>
              ¿Estás seguro? Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleDelete}
                disabled={pending}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 8,
                  background: "#7f1d1d", border: "1px solid #991b1b",
                  color: "#fca5a5", fontSize: 13, fontWeight: 700,
                  cursor: "pointer", opacity: pending ? 0.5 : 1,
                }}
              >
                {pending ? "Eliminando…" : "Sí, eliminar"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={pending}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 8,
                  background: "#18181b", border: "1px solid #3f3f46",
                  color: "#71717a", fontSize: 13, cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

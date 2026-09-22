import { getPlatformConfig } from "@/lib/admin/platform-config"
import { PlatformToggle } from "./_components/PlatformToggle"

export default async function AdminPlatformPage() {
  const googleEnabled = await getPlatformConfig("googleLoginEnabled", false)

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f4f4f5", margin: "0 0 4px" }}>
          Configuración de plataforma
        </h1>
        <p style={{ fontSize: 13, color: "#71717a", margin: 0 }}>
          Ajustes globales que afectan a todos los usuarios de SyncLead
        </p>
      </div>

      <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Google Login */}
        <div style={{
          background: "#18181b", border: "1px solid #27272a",
          borderRadius: 12, padding: "20px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#f4f4f5", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
                <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
              </svg>
              Login con Google
            </div>
            <div style={{ fontSize: 12, color: "#71717a", lineHeight: 1.5 }}>
              Permite que los usuarios inicien sesión y se registren con Google OAuth.
              Desactivar oculta el botón y rechaza cualquier intento de autenticación con Google.
            </div>
          </div>
          <PlatformToggle configKey="googleLoginEnabled" value={googleEnabled as boolean} />
        </div>

      </div>
    </div>
  )
}

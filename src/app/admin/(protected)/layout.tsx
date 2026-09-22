import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifyAdminToken, ADMIN_COOKIE } from "@/lib/admin/auth"
import { AdminHeader } from "./_components/AdminHeader"

export const metadata = { title: "Admin · SyncLead" }

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies()
  const token = jar.get(ADMIN_COOKIE)?.value
  if (!verifyAdminToken(token)) redirect("/admin/login")

  return (
    <div style={{
      minHeight: "100vh",
      background: "#09090b",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <AdminHeader />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 64px" }}>
        {children}
      </main>
    </div>
  )
}

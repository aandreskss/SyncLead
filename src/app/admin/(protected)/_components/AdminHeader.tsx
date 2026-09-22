"use client"

import Link from "next/link"
import { useTransition } from "react"
import { adminLogoutAction } from "@/app/admin/login/actions"

export function AdminHeader() {
  const [pending, start] = useTransition()

  return (
    <header style={{
      borderBottom: "1px solid #27272a",
      background: "#0d0d10",
      padding: "0 24px",
      height: 56,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 32, height: 32,
          background: "linear-gradient(135deg, #ef4444, #b91c1c)",
          borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 800, color: "#fff",
        }}>A</div>
        <Link href="/admin" style={{ fontSize: 15, fontWeight: 700, color: "#f4f4f5", textDecoration: "none" }}>
          SyncLead Admin
        </Link>
        <span style={{
          background: "#7f1d1d", color: "#fca5a5",
          fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}>Panel de control</span>
        <nav style={{ display: "flex", gap: 4, marginLeft: 12 }}>
          {[
            { href: "/admin", label: "Organizaciones" },
            { href: "/admin/users", label: "Usuarios" },
            { href: "/admin/platform", label: "Plataforma" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                fontSize: 13, color: "#71717a", textDecoration: "none",
                padding: "4px 10px", borderRadius: 6,
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/dashboard" style={{ fontSize: 12, color: "#71717a", textDecoration: "none" }}>
          Ir al dashboard →
        </Link>
        <button
          onClick={() => start(() => adminLogoutAction())}
          disabled={pending}
          style={{
            fontSize: 12, color: "#a1a1aa",
            background: "transparent", border: "1px solid #3f3f46",
            borderRadius: 6, padding: "5px 12px", cursor: "pointer",
          }}
        >
          {pending ? "..." : "Cerrar sesión"}
        </button>
      </div>
    </header>
  )
}

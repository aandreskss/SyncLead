import type { Metadata } from "next"
import { Geist, Inter } from "next/font/google"
import { SessionProvider } from "next-auth/react"
import { auth } from "@/auth"
import { headers } from "next/headers"
import "./globals.css"

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://synclead.app"

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: "SyncLead — CRM de leads para Meta Ads",
  description: "Gestiona tus leads de Facebook e Instagram en tiempo real. Conecta tu Pixel, asigna leads a WhatsApp y notifica conversiones a Meta automáticamente.",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [session, hdrs] = await Promise.all([auth(), headers()])
  const nonce = hdrs.get("x-nonce") ?? ""

  return (
    <html lang="es" className={`${geist.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[var(--font-inter)]">
        <SessionProvider session={session} basePath="/api/auth">
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}

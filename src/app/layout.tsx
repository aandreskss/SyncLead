import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { SessionProvider } from "next-auth/react"
import { auth } from "@/auth"
import { headers } from "next/headers"
import "./globals.css"

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
    <html lang="es" className={`${geist.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <SessionProvider session={session} basePath="/api/auth">
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}

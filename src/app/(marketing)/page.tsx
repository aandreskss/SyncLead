import type { Metadata } from "next"
import Link from "next/link"
import { JsonLd } from "@/components/marketing/JsonLd"

export const metadata: Metadata = {
  title: "SyncLead — CRM de leads para Meta Ads",
  description:
    "Captura leads de Facebook e Instagram en tiempo real, asígnalos a tu equipo de WhatsApp, gestiona etapas en kanban y notifica conversiones a Meta automáticamente.",
  openGraph: {
    title: "SyncLead — CRM de leads para Meta Ads",
    description:
      "Captura, organiza y convierte leads de Meta Ads en tiempo real. Kanban, WhatsApp, Meta CAPI y dashboard de rendimiento en un solo lugar.",
    type: "website",
    locale: "es_ES",
  },
  twitter: { card: "summary_large_image" },
}

const FEATURES = [
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: "Captura en tiempo real",
    desc: "Los leads de tus campañas de Meta entran automáticamente en segundos, sin descargar CSV ni copiar manualmente.",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
      </svg>
    ),
    title: "Kanban personalizable",
    desc: "Define tus etapas de venta, crea embudos visuales y mueve leads entre columnas con drag & drop.",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    title: "Asignación a WhatsApp",
    desc: "Asigna cada lead a un número de WhatsApp con un click. El chat se abre directamente con un mensaje prellenado.",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: "Meta CAPI automático",
    desc: "Cuando registras una venta, notificamos el evento Purchase a Meta Conversions API con datos hasheados para mejorar la optimización de tus campañas.",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: "Dashboard de rendimiento",
    desc: "Analiza qué campañas y anuncios generan más leads y ventas. Compara periodos y exporta a CSV.",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    title: "Multi-cliente",
    desc: "Gestiona múltiples marcas o negocios desde una sola cuenta. Cada cliente tiene sus propias campañas y datos aislados.",
  },
]

const STATS = [
  { value: "< 1s", label: "latencia de captura" },
  { value: "100%", label: "multi-tenant" },
  { value: "SHA-256", label: "hashing de datos CAPI" },
]

function DashboardMockup() {
  return (
    <div className="relative w-full max-w-4xl mx-auto mt-12">
      <div className="absolute inset-x-0 top-8 h-48 bg-indigo-500/10 blur-3xl -z-10" />
      <div className="rounded-xl border border-zinc-700/60 overflow-hidden shadow-2xl ring-1 ring-black/5">
        {/* Browser chrome */}
        <div className="bg-zinc-800 px-4 py-2.5 flex items-center gap-2 border-b border-zinc-700/50">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-600" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-600" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-600" />
          </div>
          <div className="flex-1 mx-4 sm:mx-8 bg-zinc-700/60 rounded px-3 py-1 text-xs text-zinc-500 text-center truncate">
            app.synclead.com/dashboard
          </div>
        </div>

        {/* App content */}
        <div className="bg-zinc-950 flex" style={{ height: 300 }}>
          {/* Sidebar */}
          <div className="hidden sm:flex w-44 shrink-0 border-r border-zinc-800 flex-col p-3 gap-0.5">
            <div className="px-2 py-1.5 mb-1.5">
              <span className="text-xs font-bold text-indigo-400">SyncLead</span>
            </div>
            {[
              { label: "Dashboard", active: true },
              { label: "Clientes", active: false },
              { label: "Campañas", active: false },
              { label: "Embudos", active: false },
              { label: "Rendimiento", active: false },
            ].map((item) => (
              <div
                key={item.label}
                className={`px-2 py-1.5 rounded text-xs ${
                  item.active ? "bg-zinc-800 text-zinc-100" : "text-zinc-500"
                }`}
              >
                {item.label}
              </div>
            ))}
          </div>

          {/* Main */}
          <div className="flex-1 p-4 overflow-hidden">
            {/* KPI row */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: "Leads totales", value: "1,247", delta: "↑ 12%" },
                { label: "Ventas cerradas", value: "89", delta: "↑ 8%" },
                { label: "Conversión", value: "7.1%", delta: "↑ 0.4%" },
              ].map((k) => (
                <div key={k.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5">
                  <div className="text-[10px] text-zinc-500 truncate">{k.label}</div>
                  <div className="text-base font-bold text-white mt-0.5">{k.value}</div>
                  <div className="text-[10px] text-emerald-400">{k.delta}</div>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-3">
              <div className="text-[10px] text-zinc-500 mb-2">Leads por día — últimos 14 días</div>
              <div className="flex items-end gap-1" style={{ height: 60 }}>
                {[35, 60, 42, 78, 55, 88, 72, 50, 82, 68, 94, 75, 58, 96].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{
                      height: `${h}%`,
                      background: i === 13 ? "#4f46e5" : "#4f46e540",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Mini kanban */}
            <div className="flex gap-2">
              {[
                { label: "Nuevo", count: 18, color: "#818cf8" },
                { label: "Contactado", count: 12, color: "#60a5fa" },
                { label: "Cotizado", count: 7, color: "#c084fc" },
                { label: "Ganado", count: 5, color: "#34d399" },
              ].map((col) => (
                <div key={col.label} className="flex-1 bg-zinc-900 border border-zinc-800 rounded p-2">
                  <div className="flex items-center gap-1 mb-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: col.color }} />
                    <span className="text-[10px] text-zinc-400">{col.label}</span>
                    <span className="ml-auto text-[10px] text-zinc-600">{col.count}</span>
                  </div>
                  <div className="space-y-1">
                    {Array.from({ length: Math.min(col.count, 2) }).map((_, i) => (
                      <div key={i} className="h-5 rounded bg-zinc-800 w-full" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const softwareAppLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SyncLead",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "CRM de leads para anunciantes de Meta Ads. Captura leads en tiempo real, gestiona etapas en kanban, asigna a WhatsApp y notifica conversiones con Meta CAPI.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://synclead.app",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
}

export default function HomePage() {
  return (
    <>
      <JsonLd data={softwareAppLd} />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white px-4 pt-16 pb-0 sm:pt-24 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Captura leads de Meta en tiempo real
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-zinc-900 tracking-tight leading-tight">
            Tus leads de{" "}
            <span className="text-indigo-600">Meta Ads</span>,<br />
            listos para vender
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-zinc-500 max-w-2xl mx-auto leading-relaxed">
            Conecta tus campañas de Facebook e Instagram, asigna leads a tu equipo de WhatsApp,
            gestiona etapas en un kanban y notifica conversiones a Meta — todo automáticamente.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20"
            >
              Empezar gratis
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/features"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 px-7 py-3.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Ver funciones
            </Link>
          </div>

          <p className="mt-4 text-xs text-zinc-400">Sin tarjeta de crédito · Configuración en 10 minutos</p>
        </div>

        <DashboardMockup />
      </section>

      {/* ── Stats ────────────────────────────────────────────── */}
      <section className="bg-zinc-50 border-y border-zinc-100 py-10 px-4">
        <div className="mx-auto max-w-3xl">
          <dl className="grid grid-cols-3 gap-6 text-center">
            {STATS.map((s) => (
              <div key={s.value}>
                <dd className="text-2xl sm:text-3xl font-bold text-zinc-900">{s.value}</dd>
                <dt className="mt-1 text-xs sm:text-sm text-zinc-500">{s.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-white">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 tracking-tight">
              Todo lo que necesitas para cerrar más ventas
            </h2>
            <p className="mt-4 text-zinc-500 text-lg max-w-xl mx-auto">
              Un sistema diseñado específicamente para equipos de ventas que trabajan con campañas de Meta Ads.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-zinc-100 bg-zinc-50 p-6 hover:border-indigo-100 hover:bg-indigo-50/40 transition-colors"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-zinc-200 text-indigo-600 shadow-sm group-hover:border-indigo-200 group-hover:bg-indigo-50 transition-colors">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-zinc-900 mb-2">{f.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="py-20 px-4 bg-zinc-50 border-y border-zinc-100">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 tracking-tight">
              Así de simple es el flujo
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
            {[
              { step: "01", title: "Conecta tu campaña", desc: "Copia el webhook URL de SyncLead en tu Lead Ad de Meta." },
              { step: "02", title: "Leads entran solos", desc: "Cada lead aparece en tu CRM en menos de 1 segundo, clasificado por temperatura." },
              { step: "03", title: "Asigna y contacta", desc: "Asigna el lead a un vendedor y abre WhatsApp con un click." },
              { step: "04", title: "Cierra y notifica", desc: "Al registrar la venta, Meta recibe el evento CAPI automáticamente." },
            ].map((s, i) => (
              <div key={s.step} className="relative flex flex-col items-center text-center">
                {i < 3 && (
                  <div className="hidden sm:block absolute left-[calc(50%+2rem)] top-5 w-[calc(100%-4rem)] h-px bg-zinc-200" />
                )}
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-bold">
                  {s.step}
                </div>
                <h3 className="font-semibold text-zinc-900 mb-1">{s.title}</h3>
                <p className="text-sm text-zinc-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-white">
        <div className="mx-auto max-w-2xl text-center">
          <div className="rounded-2xl bg-indigo-600 px-8 py-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
              Empieza a organizar tus leads hoy
            </h2>
            <p className="text-indigo-200 mb-8 text-lg max-w-md mx-auto">
              Conecta tu primera campaña de Meta en menos de 10 minutos. Sin tarjeta de crédito.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors shadow-lg"
            >
              Crear cuenta gratis
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}

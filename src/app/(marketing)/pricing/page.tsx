import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Precios — SyncLead",
  description:
    "SyncLead está en acceso anticipado. Únete gratis y conecta tu primera campaña de Meta Ads hoy.",
  openGraph: {
    title: "Precios — SyncLead",
    description: "Acceso anticipado gratuito. Sin tarjeta de crédito.",
    type: "website",
  },
}

const INCLUDED = [
  "Leads ilimitados por campaña",
  "Múltiples clientes y campañas",
  "Kanban con etapas personalizables",
  "Asignación a WhatsApp",
  "Meta Conversions API (CAPI)",
  "Dashboard de analytics",
  "Tabla de rendimiento por anuncio",
  "Export de datos a CSV",
  "Historial de actividad completo",
  "API Key por campaña",
  "Cifrado AES-256-GCM de tokens",
  "Soporte por WhatsApp",
]

const FAQS = [
  {
    q: "¿Cuándo tendrá precios SyncLead?",
    a: "SyncLead está en fase de acceso anticipado. Mientras tanto puedes crear tu cuenta gratis y usar todas las funciones. Los precios se anunciarán antes de salir de beta.",
  },
  {
    q: "¿Mis datos están seguros durante el beta?",
    a: "Sí. Todos los datos se almacenan en bases de datos seguras con aislamiento multi-tenant. Los tokens de Meta se encriptan con AES-256-GCM. Nunca compartimos ni vendemos tus datos.",
  },
  {
    q: "¿Necesito una cuenta de Meta Business para usar SyncLead?",
    a: "Sí. Necesitas una cuenta de Meta Business Suite con campañas de Lead Ads activas. SyncLead captura los leads que generan esas campañas.",
  },
  {
    q: "¿Puedo gestionar múltiples clientes desde una sola cuenta?",
    a: "Sí. Puedes crear múltiples clientes (marcas/negocios) dentro de tu organización, cada uno con sus propias campañas e información de Meta Pixel.",
  },
  {
    q: "¿Cómo funciona Meta CAPI con SyncLead?",
    a: "Cuando registras una venta en SyncLead, el sistema envía automáticamente el evento Purchase a Meta Conversions API usando tu token de acceso (guardado cifrado). Esto mejora la optimización de tus campañas sin configuración técnica.",
  },
]

export default function PricingPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="border-b border-zinc-100 py-16 sm:py-24 px-4 text-center">
        <div className="mx-auto max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Acceso anticipado gratuito
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-zinc-900 tracking-tight mb-5">
            Precio simple,<br />resultados claros
          </h1>
          <p className="text-zinc-500 text-lg">
            Durante el acceso anticipado, SyncLead es completamente gratuito. Sin tarjeta de crédito. Sin límites ocultos.
          </p>
        </div>
      </section>

      {/* Pricing card */}
      <section className="py-16 px-4">
        <div className="mx-auto max-w-sm">
          <div className="rounded-2xl border-2 border-indigo-600 bg-white shadow-xl shadow-indigo-100 overflow-hidden">
            {/* Header */}
            <div className="bg-indigo-600 px-8 py-6 text-center">
              <p className="text-indigo-200 text-sm font-medium mb-2">Acceso anticipado</p>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl font-bold text-white">$0</span>
                <span className="text-indigo-300">/mes</span>
              </div>
              <p className="text-indigo-200 text-xs mt-2">Por organización · Todas las funciones incluidas</p>
            </div>

            {/* Features */}
            <div className="px-8 py-6">
              <ul className="space-y-3">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm text-zinc-700">{item}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                Crear cuenta gratis
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <p className="mt-3 text-center text-xs text-zinc-400">Sin tarjeta de crédito · Cancela cuando quieras</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4 border-t border-zinc-100 bg-zinc-50">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-bold text-zinc-900 mb-10 text-center">Preguntas frecuentes</h2>
          <div className="space-y-6">
            {FAQS.map((faq) => (
              <div key={faq.q} className="rounded-xl border border-zinc-200 bg-white p-6">
                <h3 className="font-semibold text-zinc-900 mb-2">{faq.q}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 text-center">
        <div className="mx-auto max-w-xl">
          <h2 className="text-2xl font-bold text-zinc-900 mb-3">¿Tienes más preguntas?</h2>
          <p className="text-zinc-500 mb-6">Escríbenos directamente y te respondemos en menos de 24 horas.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              Empezar gratis
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

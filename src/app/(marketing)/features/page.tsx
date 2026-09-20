import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Funciones — SyncLead",
  description:
    "Todo lo que incluye SyncLead: captura automática de leads, kanban, asignación WhatsApp, Meta CAPI, dashboard de rendimiento, embudos personalizados y mucho más.",
  openGraph: {
    title: "Funciones — SyncLead",
    description: "Todas las herramientas que necesitas para convertir más leads de Meta Ads en ventas reales.",
    type: "website",
  },
}

const FEATURE_GROUPS = [
  {
    category: "Captura de leads",
    icon: "⚡",
    features: [
      {
        title: "Ingesta automática desde Meta Lead Ads",
        desc: "Conecta tus campañas de Facebook e Instagram vía API Key. Los leads entran en SyncLead en menos de 1 segundo, sin intervención manual.",
      },
      {
        title: "Clasificación de temperatura automática",
        desc: "Cada lead se clasifica como Caliente, Tibio o Frío según las respuestas del formulario y el tipo de negocio. Sin configuración extra.",
      },
      {
        title: "Idempotencia de webhooks",
        desc: "Si Meta envía el mismo lead dos veces, SyncLead lo detecta y evita duplicados. Tus datos siempre son precisos.",
      },
      {
        title: "Rate limiting por campaña",
        desc: "Protección automática contra abusos del webhook. Hasta 100 requests por minuto por IP.",
      },
    ],
  },
  {
    category: "Gestión de leads",
    icon: "📋",
    features: [
      {
        title: "Vista de tabla con filtros",
        desc: "Filtra leads por temperatura, etapa de venta o palabra clave. Los filtros se sincronizan con la URL para compartir vistas fácilmente.",
      },
      {
        title: "Panel lateral de lead",
        desc: "Click en cualquier lead para ver todos sus datos, cambiar temperatura, mover de etapa, agregar notas y ver el historial completo.",
      },
      {
        title: "Ciclo de temperatura con un click",
        desc: "Cambia entre Frío → Tibio → Caliente → Frío con un solo click en el badge de temperatura.",
      },
      {
        title: "Notas por lead",
        desc: "Agrega notas internas por lead. Todo queda registrado en el historial de actividad con fecha y hora.",
      },
      {
        title: "Historial de actividad completo",
        desc: "Cada cambio de temperatura, etapa, asignación o nota queda registrado con quién lo hizo y cuándo.",
      },
    ],
  },
  {
    category: "Asignación y ventas",
    icon: "💬",
    features: [
      {
        title: "Asignación a WhatsApp",
        desc: "Asigna cada lead a un número de teléfono con un click. Se abre WhatsApp Web directamente con el nombre del lead prellenado en el mensaje.",
      },
      {
        title: "Deselección de asignación",
        desc: "Click en el número ya asignado lo desasigna automáticamente. Sin confirmaciones innecesarias.",
      },
      {
        title: "Registro de ventas inline",
        desc: "Marca un lead como vendido directamente desde el panel lateral. Ingresa monto, moneda y fecha de cierre.",
      },
      {
        title: "Múltiples monedas",
        desc: "Soporte para USD, EUR, VES, COP, MXN y más. El monto se guarda en la moneda original y se convierte para los reportes.",
      },
    ],
  },
  {
    category: "Meta Conversions API",
    icon: "🎯",
    features: [
      {
        title: "Evento Purchase automático",
        desc: "Al registrar una venta, SyncLead envía el evento Purchase a Meta CAPI con los datos del lead y el monto exacto.",
      },
      {
        title: "Hashing SHA-256 de datos PII",
        desc: "Email, teléfono, nombre y ciudad se hashean con SHA-256 antes de enviarlos. Nunca se envían datos personales en texto claro.",
      },
      {
        title: "Token encriptado AES-256-GCM",
        desc: "Tu Meta Access Token se guarda encriptado en la base de datos y solo se descifra en el momento de enviar el evento CAPI.",
      },
      {
        title: "Estado del envío CAPI",
        desc: "Cada lead muestra el estado del envío CAPI: enviado correctamente, error con detalle, o no aplicable.",
      },
    ],
  },
  {
    category: "Analytics y reportes",
    icon: "📊",
    features: [
      {
        title: "Dashboard con KPIs",
        desc: "Leads totales, ventas cerradas, tasa de conversión y monto total — con comparativa contra el periodo anterior.",
      },
      {
        title: "Gráficas interactivas",
        desc: "Leads por día, por campaña, por anuncio, por plataforma, por dispositivo, top ciudades y temperatura en el tiempo.",
      },
      {
        title: "Selector de rango de fechas",
        desc: "Analiza los últimos 7, 30 o 90 días, o define un rango personalizado. La URL se actualiza para compartir la vista.",
      },
      {
        title: "Tabla de rendimiento de anuncios",
        desc: "Compara campaña × anuncio (utm_content): leads, ventas, conversión % y monto. Ordenable por cualquier columna.",
      },
      {
        title: "Comparativa período vs período",
        desc: "Flechas de tendencia en cada métrica muestran el cambio porcentual vs el período anterior equivalente.",
      },
      {
        title: "Exportar a CSV",
        desc: "Descarga el informe de rendimiento en CSV con compatibilidad UTF-8 para Excel.",
      },
    ],
  },
  {
    category: "Embudos y kanban",
    icon: "🗂️",
    features: [
      {
        title: "Embudos personalizables",
        desc: "Crea múltiples embudos con las etapas que necesitas. Cada etapa tiene nombre y color personalizables.",
      },
      {
        title: "Kanban con drag & drop",
        desc: "Mueve leads entre columnas arrastrando las tarjetas. El cambio de etapa se guarda automáticamente.",
      },
      {
        title: "Métricas por columna",
        desc: "Cada columna del kanban muestra el número de leads y el valor total de ventas cerradas en esa etapa.",
      },
      {
        title: "Filtros en el kanban",
        desc: "Filtra el kanban por campaña, temperatura o vendedor asignado. Los filtros se sincronizan con la URL.",
      },
    ],
  },
  {
    category: "Organización multi-cliente",
    icon: "🏢",
    features: [
      {
        title: "Múltiples clientes por cuenta",
        desc: "Gestiona varias marcas o negocios desde una sola cuenta de SyncLead. Cada cliente es completamente independiente.",
      },
      {
        title: "Múltiples campañas por cliente",
        desc: "Cada cliente puede tener tantas campañas como necesite. Cada campaña tiene su propia API Key.",
      },
      {
        title: "API Key por campaña",
        desc: "Genera, revela y rota API Keys directamente desde la interfaz. Cada Key autentica el webhook de esa campaña específica.",
      },
      {
        title: "Aislamiento total de datos",
        desc: "Cada organización solo puede ver y modificar sus propios datos. Aislamiento a nivel de aplicación en todas las queries.",
      },
    ],
  },
]

export default function FeaturesPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="border-b border-zinc-100 py-16 sm:py-24 px-4 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl sm:text-5xl font-bold text-zinc-900 tracking-tight mb-5">
            Todo lo que incluye SyncLead
          </h1>
          <p className="text-zinc-500 text-lg max-w-xl mx-auto">
            Un CRM diseñado de cero para equipos de ventas que trabajan con campañas de Meta Ads.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              Empezar gratis
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 px-7 py-3.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Ver precios
            </Link>
          </div>
        </div>
      </section>

      {/* Feature groups */}
      <section className="py-16 px-4">
        <div className="mx-auto max-w-5xl space-y-16">
          {FEATURE_GROUPS.map((group) => (
            <div key={group.category}>
              <div className="flex items-center gap-3 mb-8">
                <span className="text-2xl">{group.icon}</span>
                <h2 className="text-2xl font-bold text-zinc-900">{group.category}</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {group.features.map((f) => (
                  <div key={f.title} className="rounded-xl border border-zinc-100 bg-zinc-50 p-5">
                    <h3 className="font-semibold text-zinc-900 mb-1.5">{f.title}</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-zinc-100 py-16 px-4 text-center bg-zinc-50">
        <div className="mx-auto max-w-xl">
          <h2 className="text-2xl font-bold text-zinc-900 mb-3">¿Listo para empezar?</h2>
          <p className="text-zinc-500 mb-6">Sin tarjeta de crédito. Configuración en 10 minutos.</p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            Crear cuenta gratis
          </Link>
        </div>
      </section>
    </div>
  )
}

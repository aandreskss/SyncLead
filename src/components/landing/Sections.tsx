import Link from "next/link"
import { ArrowRight, Check, ChartColumn, ClipboardList, Database, Eye, Funnel, Globe, KeyRound, Layers, Lock, MessageCircle, RefreshCw, ShieldCheck, Target, Upload, User, Users, Zap } from "lucide-react"
import { Reveal } from "./Reveal"
import { KanbanDemo } from "./KanbanDemo"
import { CapiDemo } from "./CapiDemo"
import { Steps } from "./Steps"
import { ProductTabs } from "./ProductTabs"
import { Analytics } from "./Analytics"

function Heading({ id, eyebrow, title, lead }: { id: string; eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sg-accent">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {lead && <p className="mt-4 text-pretty leading-relaxed text-sg-muted">{lead}</p>}
    </div>
  )
}

const BEFORE = [
  "Leads_septiembre_final(2).xlsx",
  "Formulario nuevo, hoja distinta",
  "Origen del lead: sin dato",
  "Asignación manual por chat",
  "Venta cerrada… ¿Meta lo sabe?",
  "¿Qué anuncio vende de verdad?",
]
const AFTER = [
  ["Lead capturado", "Un solo registro, con fecha y datos de contacto"],
  ["Campaña y anuncio identificados", "Ventas septiembre · Video testimonio 02"],
  ["Calificado y asignado", "Caliente · Andrea"],
  ["Venta registrada", "USD 249"],
  ["Conversión enviada a Meta", "Evento recibido"],
]

export function BeforeAfter() {
  return (
    <section className="border-t border-sg-border py-20 md:py-28" aria-labelledby="ba-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Heading
            id="ba-title"
            eyebrow="Antes y después"
            title="Del caos de formularios y hojas a un flujo único"
            lead="Google Sheets funciona bien para empezar. Deja de ser suficiente cuando crece la operación: más campañas, más vendedores, más clientes y ventas que Meta debería conocer."
          />
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <Reveal className="rounded-2xl border border-sg-border bg-sg-s1 p-6">
            <h3 className="text-sm font-semibold text-sg-muted">Antes de SyncLead</h3>
            <ul className="mt-4 space-y-3">
              {BEFORE.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-sg-muted">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sg-danger" />
                  {b}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={100} className="rounded-2xl border border-sg-accent/50 bg-sg-s2 p-6 shadow-sg-glow">
            <h3 className="text-sm font-semibold text-sg-accent">Con SyncLead</h3>
            <ul className="mt-4 space-y-3">
              {AFTER.map(([t, d]) => (
                <li key={t} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-sg-green" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium">{t}</span>
                    <span className="text-xs text-sg-muted">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-20 border-t border-sg-border py-20 md:py-28" aria-labelledby="how-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Heading id="how-title" eyebrow="Cómo funciona" title="Cinco pasos, del formulario a la conversión en Meta" />
        </Reveal>
        <Steps />
      </div>
    </section>
  )
}

export function Product() {
  return (
    <section id="producto" className="scroll-mt-20 border-t border-sg-border py-20 md:py-28" aria-labelledby="product-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Heading
            id="product-title"
            eyebrow="Producto"
            title="Cinco vistas, un mismo panel"
            lead="Datos de ejemplo del dominio SyncLead. Cambia de vista para ver cómo se conectan leads, ventas y anuncios."
          />
        </Reveal>
        <ProductTabs />
      </div>
    </section>
  )
}

const FEATURES = [
  { icon: Zap, title: "Captura automática", body: "El formulario de tu landing envía cada lead a SyncLead sin copiar ni pegar nada." },
  { icon: Target, title: "Atribución por campaña y anuncio", body: "Cada lead conserva campaña, conjunto, anuncio, UTMs, fbc y fbp." },
  { icon: Layers, title: "Calificación frío, tibio y caliente", body: "Prioriza a quién responder primero." },
  { icon: User, title: "Asignación comercial", body: "Cada lead tiene un vendedor responsable." },
  { icon: MessageCircle, title: "WhatsApp", body: "Abre la conversación desde la ficha del lead. Abrir el chat no confirma que el mensaje se envió." },
  { icon: Funnel, title: "Funnel visual", body: "Ve en qué etapa está cada oportunidad." },
  { icon: ClipboardList, title: "Registro de ventas", body: "Guarda el monto y el anuncio de origen." },
  { icon: RefreshCw, title: "Meta Conversions API", body: "Devuelve la conversión a Meta y sigue su estado. Venta guardada no es lo mismo que Meta notificado." },
  { icon: ChartColumn, title: "Rendimiento de campañas", body: "Leads, ventas, conversión e ingresos por campaña y anuncio. CPL, CPA y ROAS aparecen con Meta Ads Insights." },
  { icon: Users, title: "Arquitectura multi-cliente", body: "Varios clientes y campañas dentro de una organización." },
  { icon: Upload, title: "Importación y exportación", body: "Importa leads y ventas históricas desde CSV, XLSX o XLS y exporta tus datos a CSV." },
  { icon: RefreshCw, title: "Reintentos de eventos", body: "Si Meta no responde, el evento se guarda y se reintenta. Ves su estado en todo momento." },
]

export function Features() {
  return (
    <section id="funciones" className="scroll-mt-20 border-t border-sg-border py-20 md:py-28" aria-labelledby="features-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Heading id="features-title" eyebrow="Funciones" title="Todo lo que pasa entre el clic y la venta" />
        </Reveal>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal as="li" key={f.title} delay={(i % 3) * 80} className="rounded-2xl border border-sg-border bg-sg-s1 p-6 transition-colors hover:border-sg-border-strong/60">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sg-s3 text-sg-accent">
                <f.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-sg-muted">{f.body}</p>
            </Reveal>
          ))}
        </ul>
        <p className="mt-6 text-center text-sm">
          <Link href="/features" className="font-medium text-sg-accent hover:underline">
            Ver todas las funciones
          </Link>
        </p>
      </div>
    </section>
  )
}

export function CapiSection() {
  return (
    <section className="border-t border-sg-border py-20 md:py-28" aria-labelledby="capi-title">
      <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sg-accent">Meta Conversions API</p>
          <h2 id="capi-title" className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Cierra el ciclo de atribución
          </h2>
          <p className="mt-4 leading-relaxed text-sg-muted">
            SyncLead registra la venta y envía la conversión a Meta para que puedas medir qué campañas generan negocio, no solo formularios.
          </p>
          <p className="mt-4 text-sm text-sg-muted">
            Venta guardada no significa Meta notificado. SyncLead muestra cada estado por separado para que sepas qué ya llegó y qué falta.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <CapiDemo />
        </Reveal>
      </div>
    </section>
  )
}

export function FunnelSection() {
  return (
    <section className="border-t border-sg-border py-20 md:py-28" aria-labelledby="funnel-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Heading
            id="funnel-title"
            eyebrow="Funnel y equipo comercial"
            title="Un funnel que tu equipo entiende de un vistazo"
            lead="Prueba el tablero: mueve una oportunidad con los botones de flecha. En SyncLead también puedes arrastrar las tarjetas entre etapas."
          />
        </Reveal>
        <Reveal className="mt-12">
          <KanbanDemo />
          <p className="mt-4 text-center text-xs text-sg-muted">
            El botón de WhatsApp abre la conversación. Abrir el chat no confirma que el mensaje se envió.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

export function AnalyticsSection() {
  return (
    <section className="border-t border-sg-border py-20 md:py-28" aria-labelledby="analytics-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Heading
            id="analytics-title"
            eyebrow="Analítica y rendimiento"
            title="De cada anuncio a cada dólar"
            lead="Leads, ventas, conversión e ingresos siempre están disponibles. CPL, CPA y ROAS aparecen cuando hay sincronización con Meta Ads Insights; sin ella verás N/D."
          />
        </Reveal>
        <Analytics />
      </div>
    </section>
  )
}

const SECURITY = [
  { icon: Database, title: "Separación entre organizaciones", body: "Cada consulta se limita a la organización del usuario autenticado." },
  { icon: Lock, title: "Tokens de Meta cifrados", body: "Se guardan cifrados con AES-256-GCM." },
  { icon: KeyRound, title: "API keys protegidas", body: "Una API key por campaña para recibir tus leads." },
  { icon: Users, title: "Acceso por roles", body: "Cada persona ve y hace lo que su rol permite." },
  { icon: Eye, title: "Auditoría", body: "Historial de actividad de cada lead." },
  { icon: RefreshCw, title: "Reintentos de eventos", body: "Si Meta no responde, el evento se reintenta." },
  { icon: ShieldCheck, title: "Privacidad de datos", body: "No compartimos ni vendemos tus datos." },
  { icon: Globe, title: "Neon PostgreSQL, server-side", body: "Los datos viven en Neon PostgreSQL y se acceden desde el servidor." },
]

export function Trust() {
  return (
    <section id="seguridad" className="scroll-mt-20 border-t border-sg-border py-20 md:py-28" aria-labelledby="trust-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Heading
            id="trust-title"
            eyebrow="Seguridad"
            title="Datos separados, tokens cifrados"
            lead="Un diseño sobrio: cada organización ve solo lo suyo y los secretos nunca viajan al navegador."
          />
        </Reveal>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SECURITY.map((s, i) => (
            <Reveal as="li" key={s.title} delay={(i % 4) * 60} className="rounded-2xl border border-sg-border bg-sg-s1 p-6">
              <s.icon className="h-5 w-5 text-sg-cyan" aria-hidden />
              <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-sg-muted">{s.body}</p>
            </Reveal>
          ))}
        </ul>
        <p className="mt-6 text-center text-xs text-sg-subtle">SyncLead no declara certificaciones ni cumplimiento normativo que no estén confirmados.</p>
      </div>
    </section>
  )
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
]

export function Pricing() {
  return (
    <section id="precios" className="scroll-mt-20 border-t border-sg-border py-20 md:py-28" aria-labelledby="pricing-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Heading
            id="pricing-title"
            eyebrow="Acceso anticipado"
            title="Empieza gratis durante el acceso anticipado"
            lead="Todas las funciones, por organización y sin tarjeta de crédito. Los precios se anunciarán antes de salir de beta."
          />
        </Reveal>
        <Reveal className="mx-auto mt-12 max-w-xl rounded-2xl border border-sg-border-strong/40 bg-sg-s1 p-8 shadow-sg-glow">
          <p className="flex items-baseline gap-2">
            <span className="sg-tabular text-5xl font-semibold tracking-tight">$0</span>
            <span className="text-sg-muted">/ mes</span>
          </p>
          <p className="mt-2 text-sm text-sg-muted">Por organización · Todas las funciones incluidas · Sin tarjeta de crédito</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {INCLUDED.map((i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-sg-muted">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-sg-green" aria-hidden />
                {i}
              </li>
            ))}
          </ul>
          <Link
            href="/register"
            className="sg-press mt-8 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sg-accent px-6 text-base font-semibold text-sg-on-accent transition-shadow hover:shadow-sg-glow"
          >
            Crear cuenta gratis <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <p className="mt-3 text-center text-xs">
            <Link href="/pricing" className="text-sg-accent hover:underline">
              Ver precios
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  )
}

export const FAQS = [
  { q: "¿Cómo llegan los leads a SyncLead?", a: "Se envían desde el formulario de tu landing mediante una API key por campaña. SyncLead guarda cada lead con su campaña, anuncio, UTMs, fbc y fbp." },
  { q: "¿Puedo administrar varios clientes?", a: "Sí. Dentro de una organización puedes crear varios clientes, cada uno con sus campañas y su información de Meta Pixel." },
  { q: "¿Cómo identifica la campaña y el anuncio?", a: "Con los parámetros que llegan junto al lead: UTMs y datos del anuncio. Puedes ver el origen en la ficha de cada lead." },
  { q: "¿Qué sucede cuando registro una venta?", a: "La venta queda guardada en el lead y SyncLead envía el evento Purchase a Meta mediante Conversions API. El estado del envío se muestra por separado: guardar la venta no significa que Meta ya la recibió." },
  { q: "¿Necesito conectar Meta?", a: "Para enviar conversiones a Meta necesitas conectar tu cuenta. CPL, CPA y ROAS solo se muestran cuando existe sincronización con Meta Ads Insights; sin ella verás N/D." },
  { q: "¿SyncLead envía mensajes por WhatsApp?", a: "No. Abre la conversación en WhatsApp desde la ficha del lead. Abrir el chat no confirma que el mensaje se envió." },
  { q: "¿Qué ocurre si Meta está temporalmente caído?", a: "El evento queda guardado y SyncLead lo reintenta. Puedes ver si está pendiente, reintentando, enviado o con error." },
  { q: "¿Puedo importar mis leads desde Google Sheets?", a: "Puedes importar leads y ventas históricas desde un archivo CSV, XLSX o XLS (por ejemplo, descargado desde Google Sheets), de hasta 5 MB, y exportar tus datos a CSV. No hay conexión directa con Google Sheets." },
]

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-sg-border py-20 md:py-28" aria-labelledby="faq-title">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Reveal>
          <Heading id="faq-title" eyebrow="Preguntas frecuentes" title="Lo que suelen preguntarnos" />
        </Reveal>
        <div className="mt-10 divide-y divide-sg-border rounded-2xl border border-sg-border bg-sg-s1">
          {FAQS.map((f) => (
            <details key={f.q} className="group px-5">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-left text-[15px] font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="text-sg-accent transition-transform duration-[var(--sg-dur-quick)] group-open:rotate-45">+</span>
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-sg-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function FinalCta() {
  return (
    <section className="border-t border-sg-border py-20 md:py-28" aria-labelledby="cta-title">
      <Reveal className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 id="cta-title" className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Deja de contar formularios. Empieza a medir ventas.
        </h2>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="sg-press inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sg-accent px-6 text-base font-semibold text-sg-on-accent transition-shadow hover:shadow-sg-glow sm:w-auto"
          >
            Comenzar con SyncLead <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </Reveal>
    </section>
  )
}

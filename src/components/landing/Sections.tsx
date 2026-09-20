import Link from "next/link"
import { ArrowRight, Check, Database, KeyRound, Lock, MessageCircle, ShieldCheck, Upload, Users, Zap, ChartColumn, Funnel } from "lucide-react"
import { Reveal } from "./Reveal"
import { KanbanDemo } from "./KanbanDemo"
import { CapiDemo } from "./CapiDemo"

function Heading({ id, eyebrow, title, lead }: { id: string; eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sg-accent">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {lead && <p className="mt-4 text-pretty leading-relaxed text-sg-muted">{lead}</p>}
    </div>
  )
}

const PROBLEMS = [
  { title: "Leads perdidos entre pestañas", body: "Los formularios de Meta, las hojas de cálculo y los chats viven en lugares distintos, y nadie sabe qué lead sigue sin atender." },
  { title: "Seguimiento sin prioridad", body: "Sin una señal clara de temperatura, el equipo contacta en el orden en que llegan y no en el que más convierte." },
  { title: "Meta no sabe qué se vendió", body: "Si las ventas no vuelven a la plataforma, la optimización de tus campañas trabaja a ciegas." },
]

const STEPS = [
  { n: "01", title: "Conecta tu campaña", body: "Copia el webhook y la API Key de tu campaña en el Lead Ad de Meta." },
  { n: "02", title: "Los leads entran solos", body: "Cada formulario aparece en tu CRM con su temperatura, listo para asignar." },
  { n: "03", title: "Contacta por WhatsApp", body: "Asigna a un vendedor y abre WhatsApp con un clic. El mensaje lo envía la persona, no el sistema." },
  { n: "04", title: "Cierra y notifica a Meta", body: "Al registrar la venta, SyncLead envía el evento de conversión a Meta CAPI." },
]

export function Problem() {
  return (
    <section className="border-t border-sg-border py-20 md:py-28" aria-labelledby="problem-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Heading id="problem-title" eyebrow="El problema" title="Pagar por leads que nadie sigue es la fuga más cara" />
        </Reveal>
        <ul className="mt-12 grid gap-4 md:grid-cols-3">
          {PROBLEMS.map((p, i) => (
            <Reveal as="li" key={p.title} delay={i * 80} className="rounded-2xl border border-sg-border bg-sg-s1 p-6">
              <h3 className="text-base font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-sg-muted">{p.body}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function HowItWorks() {
  return (
    <section id="producto" className="scroll-mt-20 border-t border-sg-border py-20 md:py-28" aria-labelledby="how-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Heading id="how-title" eyebrow="Cómo funciona" title="De la señal a la venta en cuatro pasos" lead="Un flujo continuo: lo que Meta genera, tu equipo lo trabaja y Meta lo aprende." />
        </Reveal>
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 80} className="rounded-2xl border border-sg-border bg-sg-s1 p-6">
              <span className="font-mono text-sm text-sg-cyan sg-tabular">{s.n}</span>
              <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-sg-muted">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function Showcase() {
  return (
    <section id="demo" className="scroll-mt-20 border-t border-sg-border py-20 md:py-28" aria-labelledby="demo-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Heading id="demo-title" eyebrow="Pruébalo aquí" title="Mueve un lead y mira cómo vuelve la conversión" lead="Dos demos interactivas con datos de ejemplo. Funcionan con teclado y no envían nada." />
        </Reveal>
        <div className="mt-12 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Reveal>
            <KanbanDemo />
          </Reveal>
          <Reveal delay={100}>
            <CapiDemo />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

const FEATURES = [
  { icon: Zap, title: "Captura en tiempo real", body: "Webhook por campaña con API Key propia: los leads entran al CRM apenas Meta los entrega." },
  { icon: Funnel, title: "Kanban con etapas propias", body: "Personaliza tu embudo y mueve leads entre etapas con historial de actividad completo." },
  { icon: MessageCircle, title: "WhatsApp con un clic", body: "Asigna leads a vendedores y abre la conversación en WhatsApp. Nunca se envía un mensaje por ti." },
  { icon: ChartColumn, title: "Rendimiento por anuncio", body: "Dashboard y tabla por anuncio. El costo por lead y el ROAS aparecen cuando conectas Meta Ads Insights." },
  { icon: Users, title: "Multi-cliente", body: "Agencias: un cliente por marca, cada uno con sus campañas y su información de Pixel." },
  { icon: Upload, title: "Importa y exporta", body: "Importa leads y exporta tus datos a CSV cuando los necesites." },
]

export function Features() {
  return (
    <section id="funciones" className="scroll-mt-20 border-t border-sg-border py-20 md:py-28" aria-labelledby="features-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Heading id="features-title" eyebrow="Funciones" title="Todo lo que necesita un equipo que vive de los leads" />
        </Reveal>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal as="li" key={f.title} delay={(i % 3) * 80} className="group rounded-2xl border border-sg-border bg-sg-s1 p-6 transition-colors hover:border-sg-border-strong/60">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sg-s3 text-sg-accent">
                <f.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-sg-muted">{f.body}</p>
            </Reveal>
          ))}
        </ul>
        <Reveal className="mt-4 rounded-2xl border border-sg-border bg-sg-s1 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold">Métricas honestas</h3>
              <p className="mt-1 max-w-xl text-sm text-sg-muted">
                Sin conexión a Meta Ads Insights no inventamos costos: verás N/D en lugar de una cifra que no existe.
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-6 text-center">
              {["CPL", "CPA", "ROAS"].map((k) => (
                <div key={k}>
                  <dt className="text-xs text-sg-subtle">{k}</dt>
                  <dd className="sg-tabular font-mono text-xl text-sg-muted">N/D</dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

const AUDIENCES = [
  { title: "Para agencias", body: "Gestiona varios clientes desde una sola organización, con campañas y Pixel separados por marca." },
  { title: "Para equipos comerciales", body: "Prioriza por temperatura, reparte leads entre vendedores y sigue cada conversación desde el CRM." },
]

export function Audiences() {
  return (
    <section className="border-t border-sg-border py-20 md:py-28" aria-labelledby="aud-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Heading id="aud-title" eyebrow="A quién ayuda" title="Hecho para quien compra leads y para quien los cierra" />
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {AUDIENCES.map((a, i) => (
            <Reveal key={a.title} delay={i * 80} className="rounded-2xl border border-sg-border bg-sg-s1 p-8">
              <h3 className="text-lg font-semibold">{a.title}</h3>
              <p className="mt-3 leading-relaxed text-sg-muted">{a.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

const SECURITY = [
  { icon: Lock, title: "Tokens cifrados", body: "Los tokens de Meta se guardan con AES-256-GCM." },
  { icon: Database, title: "Aislamiento multi-tenant", body: "Cada organización ve únicamente sus propios datos." },
  { icon: KeyRound, title: "API Key por campaña", body: "Puedes rotar la llave de una campaña sin afectar al resto." },
  { icon: ShieldCheck, title: "Tus datos son tuyos", body: "No compartimos ni vendemos tus datos." },
]

export function Trust() {
  return (
    <section className="border-t border-sg-border py-20 md:py-28" aria-labelledby="trust-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Heading id="trust-title" eyebrow="Confianza" title="Seguridad y control desde el primer lead" />
        </Reveal>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SECURITY.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 60} className="rounded-2xl border border-sg-border bg-sg-s1 p-6">
              <s.icon className="h-5 w-5 text-sg-cyan" aria-hidden />
              <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-sg-muted">{s.body}</p>
            </Reveal>
          ))}
        </ul>
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
  "Dashboard y tabla de rendimiento",
  "Exportación de datos a CSV",
  "Historial de actividad completo",
]

export function Pricing() {
  return (
    <section id="precios" className="scroll-mt-20 border-t border-sg-border py-20 md:py-28" aria-labelledby="pricing-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Heading id="pricing-title" eyebrow="Precios" title="Acceso anticipado gratuito" lead="Usa todas las funciones sin costo mientras SyncLead está en beta. Los precios se anunciarán antes de salir de beta." />
        </Reveal>
        <Reveal className="mx-auto mt-12 max-w-xl rounded-2xl border border-sg-border-strong/40 bg-sg-s1 p-8 shadow-sg-glow">
          <p className="flex items-baseline gap-2">
            <span className="sg-tabular text-5xl font-semibold tracking-tight">$0</span>
            <span className="text-sg-muted">/ mes durante el acceso anticipado</span>
          </p>
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
          <p className="mt-3 text-center text-xs text-sg-subtle">Sin tarjeta de crédito.</p>
        </Reveal>
      </div>
    </section>
  )
}

export const FAQS = [
  { q: "¿Cuándo tendrá precios SyncLead?", a: "SyncLead está en fase de acceso anticipado. Mientras tanto puedes crear tu cuenta gratis y usar todas las funciones. Los precios se anunciarán antes de salir de beta." },
  { q: "¿Mis datos están seguros durante el beta?", a: "Los datos se almacenan con aislamiento multi-tenant y los tokens de Meta se cifran con AES-256-GCM. No compartimos ni vendemos tus datos." },
  { q: "¿Necesito una cuenta de Meta Business?", a: "Sí. Necesitas una cuenta de Meta Business Suite con campañas de Lead Ads activas: SyncLead captura los leads que generan esas campañas." },
  { q: "¿Puedo gestionar varios clientes desde una cuenta?", a: "Sí. Puedes crear varios clientes (marcas o negocios) dentro de tu organización, cada uno con sus campañas y su información de Pixel." },
  { q: "¿Cómo funciona Meta CAPI con SyncLead?", a: "Cuando registras una venta, SyncLead envía el evento de conversión a Meta Conversions API con tu token de acceso, guardado cifrado, para que Meta optimice con ventas reales." },
  { q: "¿SyncLead envía mensajes de WhatsApp por mí?", a: "No. SyncLead abre WhatsApp con el contacto del lead para que la persona escriba y envíe el mensaje. Nunca se marca un mensaje como enviado por el sistema." },
  { q: "¿Puedo importar mis leads actuales?", a: "Sí, puedes importar leads desde el módulo Importar y exportar tus datos a CSV en cualquier momento." },
  { q: "¿Cómo contacto al equipo?", a: "Desde tu cuenta tienes soporte por WhatsApp. Si aún no tienes cuenta, créala gratis y te atendemos desde ahí." },
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
          Convierte tus leads de Meta en ventas que Meta puede ver
        </h2>
        <p className="mt-4 text-sg-muted">Crea tu cuenta gratis y conecta tu primera campaña.</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="sg-press inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sg-accent px-6 text-base font-semibold text-sg-on-accent transition-shadow hover:shadow-sg-glow sm:w-auto"
          >
            Empezar gratis <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-sg-border-strong/50 px-6 text-base font-medium hover:bg-sg-s2 sm:w-auto"
          >
            Iniciar sesión
          </Link>
        </div>
      </Reveal>
    </section>
  )
}

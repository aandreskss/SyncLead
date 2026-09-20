import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"
import { InView } from "./InView"

const STAGES = [
  { label: "Meta Lead Ad", note: "Formulario enviado", tone: "text-sg-cold" },
  { label: "SyncLead", note: "Lead + temperatura", tone: "text-sg-accent" },
  { label: "WhatsApp", note: "Contacto con un clic", tone: "text-sg-green" },
  { label: "Meta CAPI", note: "Conversión devuelta", tone: "text-sg-cyan" },
]

const SAMPLE = [
  { name: "Lead de ejemplo A", temp: "Caliente", cls: "border-sg-hot/50 bg-sg-hot/10 text-sg-hot", stage: "Nuevo" },
  { name: "Lead de ejemplo B", temp: "Tibio", cls: "border-sg-warm/50 bg-sg-warm/10 text-sg-warm", stage: "Contactado" },
  { name: "Lead de ejemplo C", temp: "Frío", cls: "border-sg-cold/50 bg-sg-cold/10 text-sg-cold", stage: "Nuevo" },
]

export function Hero() {
  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      <div aria-hidden className="lp-grid-bg pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-12rem] h-[28rem] w-[46rem] -translate-x-1/2 rounded-full bg-sg-accent/20 blur-[120px]"
      />
      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 md:pb-24 md:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="sg-rise inline-flex items-center gap-2 rounded-full border border-sg-border bg-sg-s1 px-3 py-1 text-xs font-medium text-sg-muted">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sg-green" />
            CRM para Meta Ads · Acceso anticipado
          </p>
          <h1
            id="hero-title"
            style={{ ["--i" as string]: 1 }}
            className="sg-rise mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl"
          >
            Cada lead de Meta Ads, de la primera señal a la venta
          </h1>
          <p
            style={{ ["--i" as string]: 2 }}
            className="sg-rise mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-sg-muted sm:text-lg"
          >
            SyncLead captura tus leads en tiempo real, los prioriza por temperatura, abre WhatsApp con un clic y devuelve la
            conversión a Meta con CAPI para que tus campañas aprendan de las ventas reales.
          </p>
          <div style={{ ["--i" as string]: 3 }} className="sg-rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="sg-press inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sg-accent px-6 text-base font-semibold text-sg-on-accent transition-shadow hover:shadow-sg-glow sm:w-auto"
            >
              Empezar gratis <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/#producto"
              className="sg-press inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-sg-border-strong/50 px-6 text-base font-medium text-sg-ink transition-colors hover:bg-sg-s2 sm:w-auto"
            >
              Ver cómo funciona
            </Link>
          </div>
          <p style={{ ["--i" as string]: 4 }} className="sg-rise mt-4 inline-flex items-center gap-2 text-sm text-sg-subtle">
            <Check className="h-4 w-4 text-sg-green" aria-hidden /> Sin tarjeta de crédito durante el acceso anticipado
          </p>
        </div>

        {/* Demo del producto: recorrido de una señal */}
        <InView className="mx-auto mt-14 max-w-4xl md:mt-20">
          <div
            style={{ ["--i" as string]: 5 }}
            className="sg-rise rounded-2xl border border-sg-border bg-sg-s1 p-4 shadow-sg-float sm:p-6"
          >
            <ol className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-y-0" aria-label="Recorrido de un lead">
              {STAGES.map((s, i) => (
                <li key={s.label} className="relative">
                  <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-2">
                    <span
                      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sg-border bg-sg-s3 font-mono text-xs sg-tabular ${s.tone}`}
                    >
                      0{i + 1}
                      <span aria-hidden className="lp-ring absolute inset-0 rounded-lg border border-sg-green" style={{ ["--i" as string]: i }} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{s.label}</p>
                      <p className="text-xs text-sg-subtle">{s.note}</p>
                    </div>
                  </div>
                  {i < STAGES.length - 1 && (
                    <span aria-hidden className="absolute left-12 right-[-0.75rem] top-[1.125rem] hidden h-px md:block">
                      <span className="lp-line absolute inset-0 rounded-full" />
                      <span className="lp-pulse-dot" style={{ ["--i" as string]: i }} />
                    </span>
                  )}
                </li>
              ))}
            </ol>

            <div className="mt-6 overflow-hidden rounded-xl border border-sg-border bg-sg-bg">
              <div className="flex items-center justify-between border-b border-sg-border px-4 py-2.5">
                <p className="text-xs font-medium text-sg-muted">Leads recientes</p>
                <p className="text-[11px] text-sg-subtle">Datos de ejemplo</p>
              </div>
              <ul>
                {SAMPLE.map((l) => (
                  <li key={l.name} className="flex items-center justify-between gap-3 border-b border-sg-border px-4 py-3 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="text-xs text-sg-subtle">Etapa: {l.stage}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${l.cls}`}>{l.temp}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </InView>
      </div>
    </section>
  )
}

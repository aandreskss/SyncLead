import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"
import { InView } from "./InView"
import { FunnelBars, HeatBadge, Kpi, Sample } from "./ui"

const CHAIN = ["Anuncio de Meta", "Landing", "SyncLead", "Vendedor", "Venta", "Meta CAPI"]

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
            De anuncio a venta, sin perder la atribución
          </p>
          <h1
            id="hero-title"
            style={{ ["--i" as string]: 1 }}
            className="sg-rise mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl"
          >
            Convierte cada lead de Meta en una oportunidad medible
          </h1>
          <p
            style={{ ["--i" as string]: 2 }}
            className="sg-rise mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-sg-muted sm:text-lg"
          >
            Captura, atribuye, califica y asigna tus leads. Registra ventas y devuelve cada conversión a Meta desde un solo lugar.
          </p>
          <div style={{ ["--i" as string]: 3 }} className="sg-rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="sg-press inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sg-accent px-6 text-base font-semibold text-sg-on-accent transition-shadow hover:shadow-sg-glow sm:w-auto"
            >
              Comenzar ahora <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/#como-funciona"
              className="sg-press inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-sg-border-strong/50 px-6 text-base font-medium text-sg-ink transition-colors hover:bg-sg-s2 sm:w-auto"
            >
              Ver cómo funciona
            </Link>
          </div>
          <p style={{ ["--i" as string]: 4 }} className="sg-rise mt-4 inline-flex items-center gap-2 text-sm text-sg-subtle">
            <Check className="h-4 w-4 text-sg-green" aria-hidden /> Meta Ads · WhatsApp · Conversions API · Analítica
          </p>
        </div>

        <InView className="mx-auto mt-14 max-w-5xl md:mt-20">
          <div style={{ ["--i" as string]: 5 }} className="sg-rise rounded-2xl border border-sg-border bg-sg-s1 p-4 shadow-sg-float sm:p-6">
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-xs" aria-label="Recorrido de un lead">
              {CHAIN.map((c, i) => (
                <li key={c} className="flex items-center gap-1">
                  <span
                    className={`rounded-full border px-2.5 py-1 font-medium ${
                      i === CHAIN.length - 1 ? "border-sg-green/50 text-sg-green" : i === 2 ? "border-sg-accent/60 text-sg-accent" : "border-sg-border text-sg-muted"
                    }`}
                  >
                    {c}
                  </span>
                  {i < CHAIN.length - 1 && (
                    <span aria-hidden className="relative mx-1 hidden h-px w-6 overflow-visible sm:block">
                      <span className="lp-line absolute inset-0" />
                      <span className="lp-pulse-dot" style={{ ["--i" as string]: i }} />
                    </span>
                  )}
                </li>
              ))}
            </ol>

            <div className="mt-5 flex items-center justify-between">
              <p className="text-sm font-medium">Ventas septiembre · Video testimonio 02</p>
              <Sample />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="Leads" value="870" note="+12,4 % vs. semana anterior" />
              <Kpi label="Conversión" value="5,9 %" note="+0,4 pts" />
              <Kpi label="Ingresos" value="USD 12.699" note="51 ventas" />
              <Kpi label="Meta CAPI" value="Recibido" note="Última venta: USD 249" tone="text-sg-green" />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1.3fr_1fr]">
              <div className="rounded-xl border border-sg-border bg-sg-bg p-4">
                <p className="mb-3 text-xs font-medium text-sg-muted">Funnel</p>
                <FunnelBars />
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-sg-border bg-sg-bg p-4">
                  <p className="text-xs text-sg-subtle">Lead nuevo · hace 3 min</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Mariana López</p>
                    <HeatBadge heat="Caliente" />
                  </div>
                  <p className="mt-1 text-xs text-sg-muted">Ventas septiembre · Sin asignar</p>
                </div>
                <div className="rounded-xl border border-sg-border bg-sg-bg p-4">
                  <p className="text-xs text-sg-subtle">Rendimiento del anuncio</p>
                  <p className="mt-1 text-sm font-medium">Video testimonio 02</p>
                  <p className="sg-tabular mt-1 text-xs text-sg-muted">
                    412 leads · 31 ventas · CPL <span className="font-mono">N/D</span>
                  </p>
                  <p className="mt-1 text-[11px] text-sg-subtle">Conecta Meta Ads Insights para ver CPL, CPA y ROAS.</p>
                </div>
              </div>
            </div>
          </div>
        </InView>
      </div>
    </section>
  )
}

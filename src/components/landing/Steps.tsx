"use client"

import { useState } from "react"
import { HeatBadge, Sample } from "./ui"

const STEPS = [
  { n: "01", t: "Captura el lead", d: "El formulario de tu landing envía el lead a SyncLead en cuanto se completa.", r: "Resultado: el lead queda registrado con fecha, hora y datos de contacto." },
  { n: "02", t: "Identifica su campaña y anuncio", d: "Se conservan campaña, conjunto, anuncio, UTMs, fbc, fbp, plataforma y dispositivo.", r: "Resultado: sabes de qué anuncio salió cada lead." },
  { n: "03", t: "Califica y asigna", d: "Marca el lead como frío, tibio o caliente y asígnalo a un vendedor.", r: "Resultado: cada lead tiene prioridad y responsable." },
  { n: "04", t: "Gestiona el seguimiento", d: "Abre WhatsApp desde la ficha y mueve el lead por el funnel kanban.", r: "Resultado: el equipo ve en qué etapa está cada oportunidad." },
  { n: "05", t: "Registra la venta y notifícala a Meta", d: "Al registrar la venta, SyncLead envía la conversión a Meta mediante Conversions API.", r: "Resultado: Meta aprende qué anuncios generan negocio." },
]

const ATTR = [
  ["Campaña", "Ventas septiembre"],
  ["Conjunto", "Público frío"],
  ["Anuncio", "Video testimonio 02"],
  ["Plataforma", "Facebook"],
  ["Dispositivo", "Móvil"],
  ["utm_source", "facebook"],
  ["utm_campaign", "ventas-septiembre"],
  ["fbc / fbp", "fb.1.••••••••"],
]

function Visual({ i }: { i: number }) {
  if (i === 0)
    return (
      <div className="space-y-3">
        <p className="text-xs text-sg-subtle">Landing · Ventas septiembre</p>
        <div className="rounded-lg border border-sg-border bg-sg-bg px-3 py-2 text-sm">Mariana López</div>
        <div className="rounded-lg border border-sg-border bg-sg-bg px-3 py-2 text-sm text-sg-muted">WhatsApp: +•• ••• •••• ••</div>
        <p className="text-xs text-sg-muted">Lead nuevo · Mariana López · recibido hace 3 s</p>
      </div>
    )
  if (i === 1)
    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {ATTR.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] text-sg-subtle">{k}</dt>
            <dd className="truncate font-mono text-[13px]">{v}</dd>
          </div>
        ))}
      </dl>
    )
  if (i === 2)
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Mariana López</p>
          <HeatBadge heat="Caliente" />
        </div>
        <p className="text-xs text-sg-muted">Video testimonio 02 · Vendedor: Andrea</p>
        <div className="flex gap-2">
          <HeatBadge heat="Frío" />
          <HeatBadge heat="Tibio" />
          <HeatBadge heat="Caliente" />
        </div>
      </div>
    )
  if (i === 3)
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-sg-border bg-sg-bg p-2.5">
            <p className="text-sg-subtle">Contactado</p>
            <p className="mt-1 text-sm">Diego Rivas</p>
          </div>
          <div className="rounded-lg border border-sg-border bg-sg-bg p-2.5">
            <p className="text-sg-subtle">Interesado</p>
            <p className="mt-1 text-sm">Mariana López</p>
          </div>
        </div>
        <p className="text-xs text-sg-muted">Abrir el chat no confirma que el mensaje se envió. La ficha guarda tus notas.</p>
      </div>
    )
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-sg-border bg-sg-bg p-3">
        <div>
          <p className="text-xs text-sg-subtle">Venta registrada</p>
          <p className="text-sm">Mariana López · Video testimonio 02</p>
        </div>
        <p className="sg-tabular font-mono text-lg">USD 249</p>
      </div>
      <p className="text-sm text-sg-green">Evento guardado → Enviado a Meta → Evento recibido</p>
    </div>
  )
}

export function Steps() {
  const [step, setStep] = useState(0)
  return (
    <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_1fr]">
      <ol className="space-y-2">
        {STEPS.map((s, i) => (
          <li key={s.n}>
            <button
              type="button"
              onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={`flex w-full gap-4 rounded-2xl border p-4 text-left transition-[border-color,background-color,box-shadow] duration-[var(--sg-dur-standard)] sm:p-5 ${
                i === step ? "border-sg-accent bg-sg-s2 shadow-sg-glow" : "border-sg-border bg-transparent hover:bg-sg-s1"
              }`}
            >
              <span className={`pt-0.5 font-mono text-sm font-semibold ${i === step ? "text-sg-accent" : "text-sg-subtle"}`}>{s.n}</span>
              <span>
                <span className="block text-[15px] font-semibold">{s.t}</span>
                <span className="mt-1 block text-sm leading-relaxed text-sg-muted">{s.d}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="rounded-2xl border border-sg-border bg-sg-s1 p-5 shadow-sg-raise lg:sticky lg:top-24 lg:self-start">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-medium">Paso {STEPS[step].n}</p>
          <Sample />
        </div>
        <div key={step} className="sg-rise min-h-[11rem]">
          <Visual i={step} />
        </div>
        <p aria-live="polite" className="mt-5 border-t border-sg-border pt-4 text-sm text-sg-cyan">
          {STEPS[step].r}
        </p>
      </div>
    </div>
  )
}

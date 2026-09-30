import { redirect } from "next/navigation"
import { requireOrganizationMembership } from "@/lib/auth/server"
import { AuthError, ForbiddenError } from "@/lib/auth/errors"
import { MessageCircle, Share2, Globe, Zap, Users, TrendingUp, AlertCircle } from "lucide-react"
import { PageShell, PageHeader, Panel, StatusChip, EmptyState, opsBtnPrimary, opsBtnSecondary } from "@/components/app/ops"
import Link from "next/link"

export default async function InsightsMetaPage() {
  try {
    await requireOrganizationMembership()
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) redirect("/login")
    throw e
  }

  return (
    <PageShell className="max-w-4xl mx-auto">
      <PageHeader
        eyebrow="INSIGHTS META"
        title="Comentarios y mensajes de Meta"
        subtitle="Señales de intención desde Facebook, Instagram y WhatsApp."
      />

      {/* Estado principal — no conectado */}
      <Panel className="py-2">
        <div className="flex flex-col items-center gap-5 px-6 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-ops-blue-bg text-ops-blue">
            <MessageCircle className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <p className="text-base font-semibold text-ops-tx">
              La API de comentarios y mensajes de Meta aún no está conectada
            </p>
            <p className="mx-auto max-w-sm text-sm text-ops-tx2">
              Cuando esté activa, verás aquí las señales de intención de tus prospectos en Facebook, Instagram y WhatsApp: comentarios en anuncios, mensajes directos y conversaciones de interés.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusChip tone="neutral">No conectado</StatusChip>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/dashboard/clients"
              className={opsBtnPrimary}
            >
              Conectar Meta
            </Link>
            <Link
              href="/dashboard/health"
              className={opsBtnSecondary}
            >
              Ver diagnóstico
            </Link>
          </div>
        </div>
      </Panel>

      {/* Vista previa */}
      <div className="relative">
        {/* Ribbon de vista previa */}
        <div className="mb-3 flex items-center gap-3">
          <span className="rounded-full bg-ops-amber-bg px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-ops-amber">
            Vista previa
          </span>
          <span className="text-xs text-ops-tx3">Datos de ejemplo — no en vivo</span>
        </div>

        {/* Overlay de blur para indicar que no está activo */}
        <div className="pointer-events-none select-none">
          <div className="absolute inset-0 z-10 rounded-[20px] backdrop-blur-[3px]" />
          <div className="absolute inset-0 z-20 flex items-start justify-center pt-10">
            <div className="flex items-center gap-2 rounded-full border border-ops-amber/30 bg-ops-amber-bg px-4 py-2 text-sm font-medium text-ops-amber shadow-ops-card">
              <AlertCircle className="h-4 w-4" />
              Esta sección se activará cuando conectes la API de Meta
            </div>
          </div>

          <div className="space-y-4">
            {/* Tarjetas de canales */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Panel>
                <div className="flex flex-col items-center gap-3 px-5 py-6 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ops-blue-bg">
                    <Share2 className="h-5 w-5 text-ops-blue" />
                  </div>
                  <div>
                    <p className="text-[28px] font-bold tabular-nums text-ops-tx">248</p>
                    <p className="text-xs text-ops-tx3">Comentarios Facebook</p>
                  </div>
                  <StatusChip tone="green">42 con intención</StatusChip>
                </div>
              </Panel>
              <Panel>
                <div className="flex flex-col items-center gap-3 px-5 py-6 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ops-coral-bg">
                    <Globe className="h-5 w-5 text-ops-coral" />
                  </div>
                  <div>
                    <p className="text-[28px] font-bold tabular-nums text-ops-tx">133</p>
                    <p className="text-xs text-ops-tx3">Comentarios Instagram</p>
                  </div>
                  <StatusChip tone="amber">19 con intención</StatusChip>
                </div>
              </Panel>
              <Panel>
                <div className="flex flex-col items-center gap-3 px-5 py-6 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ops-green-bg">
                    <Users className="h-5 w-5 text-ops-green" />
                  </div>
                  <div>
                    <p className="text-[28px] font-bold tabular-nums text-ops-tx">87</p>
                    <p className="text-xs text-ops-tx3">Prospectos únicos</p>
                  </div>
                  <StatusChip tone="green">En seguimiento</StatusChip>
                </div>
              </Panel>
            </div>

            {/* Panel navy — Radar de intención */}
            <Panel variant="navy" title="Radar de intención">
              <div className="divide-y divide-ops-navy-tx2/20">
                {[
                  { name: "Carlos M.", signal: "Preguntó precio directo", intent: "Alta", affinity: "Producto A", priority: 95 },
                  { name: "Luisa R.", signal: '"¿Cuándo puedo comprarlo?"', intent: "Alta", affinity: "Producto B", priority: 88 },
                  { name: "Marco T.", signal: "Compartió el anuncio", intent: "Media", affinity: "Producto A", priority: 61 },
                  { name: "Ana G.", signal: "Comentó ❤️ en el post", intent: "Baja", affinity: "General", priority: 34 },
                ].map((row) => (
                  <div key={row.name} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ops-navy-tx2/20 text-xs font-semibold text-ops-navy-tx">
                      {row.name.split(" ").map((p) => p[0]).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ops-navy-tx">{row.name}</p>
                      <p className="truncate text-xs text-ops-navy-tx2">{row.signal}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-semibold tabular-nums text-ops-navy-tx">{row.priority}</p>
                      <p className="text-[11px] text-ops-navy-tx2">Prioridad</p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Tabla de señales */}
            <Panel title="Señales recientes">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className="h-9 border-y border-ops-line bg-ops-th-bg px-4 text-left text-xs font-semibold uppercase tracking-wide text-ops-tx3">Prospecto</th>
                    <th className="h-9 border-y border-ops-line bg-ops-th-bg px-4 text-left text-xs font-semibold uppercase tracking-wide text-ops-tx3">Señal</th>
                    <th className="h-9 border-y border-ops-line bg-ops-th-bg px-4 text-left text-xs font-semibold uppercase tracking-wide text-ops-tx3">Canal</th>
                    <th className="h-9 border-y border-ops-line bg-ops-th-bg px-4 text-left text-xs font-semibold uppercase tracking-wide text-ops-tx3">Intención</th>
                    <th className="h-9 border-y border-ops-line bg-ops-th-bg px-4 text-left text-xs font-semibold uppercase tracking-wide text-ops-tx3">Hace</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: "Carlos M.", signal: "Preguntó por precio", channel: "Facebook", intent: "Alta", when: "5 min" },
                    { name: "Luisa R.", signal: "Quiere comprar", channel: "Instagram", intent: "Alta", when: "12 min" },
                    { name: "Pedro A.", signal: "Pidió más info", channel: "WhatsApp", intent: "Media", when: "1 h" },
                    { name: "María C.", signal: "Me gusta en anuncio", channel: "Facebook", intent: "Baja", when: "2 h" },
                  ].map((row) => (
                    <tr key={row.name} className="border-b border-ops-line">
                      <td className="px-4 py-3 font-medium text-ops-tx">{row.name}</td>
                      <td className="px-4 py-3 text-ops-tx2">{row.signal}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-ops-blue-bg px-2.5 py-0.5 text-[11px] font-medium text-ops-blue">
                          {row.channel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip tone={row.intent === "Alta" ? "green" : row.intent === "Media" ? "amber" : "neutral"}>
                          {row.intent}
                        </StatusChip>
                      </td>
                      <td className="px-4 py-3 text-ops-tx3">{row.when}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        </div>
      </div>
    </PageShell>
  )
}

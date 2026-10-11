"use client"

import type { ConversationDetail } from "@/domains/ai-agents/inbox-repository"
import { cn } from "@/lib/utils"

const TEMPERATURE_LABEL: Record<string, string> = {
  hot: "Caliente",
  warm: "Tibio",
  cold: "Frío",
}

const TEMPERATURE_COLOR: Record<string, string> = {
  hot: "bg-red-100 text-red-700",
  warm: "bg-ops-amber-bg text-amber-700",
  cold: "bg-blue-50 text-blue-700",
}

const STAGE_LABEL: Record<string, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  interested: "Interesado",
  quoted: "Cotizado",
  won: "Ganado",
  lost: "Perdido",
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-ops-tx3">{label}</span>
      <span className="text-sm text-ops-tx">{value}</span>
    </div>
  )
}

export default function LeadPanel({ detail }: { detail: ConversationDetail }) {
  const { lead, conversation } = detail

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ops-tx3">Contacto</p>
        <div className="mt-2 space-y-2">
          <Field label="Nombre" value={conversation.customerName} />
          <Field label="Teléfono" value={conversation.customerPhone} />
          <Field label="Resumen conv." value={conversation.summary} />
        </div>
      </div>

      {lead && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ops-tx3">Lead</p>
          <div className="mt-2 space-y-2">
            <Field label="Nombre" value={lead.name} />
            <Field label="Email" value={lead.email} />
            <Field label="Teléfono" value={lead.phone} />

            {lead.temperature && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-medium uppercase tracking-wide text-ops-tx3">Temperatura</span>
                <span className={cn("inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium", TEMPERATURE_COLOR[lead.temperature] ?? "bg-ops-s2 text-ops-tx")}>
                  {TEMPERATURE_LABEL[lead.temperature] ?? lead.temperature}
                </span>
              </div>
            )}

            {lead.stage && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-medium uppercase tracking-wide text-ops-tx3">Etapa</span>
                <span className="text-sm text-ops-tx">{STAGE_LABEL[lead.stage] ?? lead.stage}</span>
              </div>
            )}

            <Field label="Notas" value={lead.notes} />
          </div>
        </div>
      )}

      {detail.assignedUser && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ops-tx3">Asignado a</p>
          <p className="mt-1 text-sm text-ops-tx">{detail.assignedUser.name ?? detail.assignedUser.email}</p>
        </div>
      )}
    </div>
  )
}

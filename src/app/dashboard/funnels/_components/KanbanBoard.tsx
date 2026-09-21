"use client"

import { useState, useEffect, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core"
import { User } from "lucide-react"
import { StatusChip } from "@/components/app/ops"
import { CSS } from "@dnd-kit/utilities"
import { updateLeadStageAction } from "@/domains/leads/actions"
import { LeadDrawer } from "@/app/dashboard/campaigns/[id]/leads/_components/LeadDrawer"
import type { Funnel, FunnelStageConfig, LeadStage, SalesRep } from "@/lib/db/schema"
import type { LeadWithActivity } from "@/domains/leads/repository"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tempTone(t: string): "coral" | "amber" | "cold" {
  if (t === "hot") return "coral"
  if (t === "warm") return "amber"
  return "cold"
}
function tempLabel(t: string) {
  if (t === "hot") return "Caliente"
  if (t === "warm") return "Tibio"
  return "Frío"
}
function formatDate(d: Date | string) {
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(new Date(d))
}

// ─── Draggable Card ───────────────────────────────────────────────────────────

function KanbanCard({
  lead,
  isDragOverlay = false,
  onCardClick,
}: {
  lead: LeadWithActivity
  isDragOverlay?: boolean
  onCardClick?: (lead: LeadWithActivity) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id })

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => {
        if (!isDragging && onCardClick) {
          onCardClick(lead)
        }
      }}
      className={`rounded-md border bg-ops-s2 p-3 cursor-grab active:cursor-grabbing select-none transition-opacity ${
        isDragging && !isDragOverlay ? "opacity-30 border-ops-bd" : "border-ops-line hover:border-ops-bd2"
      }`}
    >
      <p className="font-medium text-ops-tx text-[13px] truncate">{lead.name}</p>
      {lead.phone && (
        <p className="text-xs text-ops-tx2 font-plex tabular-nums mt-0.5">{lead.phone}</p>
      )}
      <div className="flex items-center justify-between mt-2">
        <StatusChip tone={tempTone(lead.temperature)}>{tempLabel(lead.temperature)}</StatusChip>
        <span className="text-xs text-ops-tx3">{formatDate(lead.createdAt)}</span>
      </div>
      {lead.assignedTo && (
        <p className="mt-2 flex items-center gap-1.5 truncate text-xs text-ops-tx2">
          <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{lead.assignedTo}</span>
        </p>
      )}
      {lead.saleCount > 0 && (
        <p className="text-xs text-ops-green mt-1.5 font-medium font-plex tabular-nums">
          {lead.saleTotalAmount
            ? `$ ${parseFloat(lead.saleTotalAmount).toFixed(2)}${lead.saleCount > 1 ? ` ·${lead.saleCount}` : ""}`
            : `${lead.saleCount} ${lead.saleCount === 1 ? "venta" : "ventas"}`}
        </p>
      )}
    </div>
  )
}

// ─── Droppable Column ─────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  leads,
  onCardClick,
}: {
  stage: FunnelStageConfig
  leads: LeadWithActivity[]
  onCardClick: (lead: LeadWithActivity) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.stageKey })

  const salesLeads = leads.filter((l) => l.saleCount > 0 && l.saleTotalAmount !== null)
  const currencies = new Set(salesLeads.map((l) => l.saleCurrency).filter(Boolean))
  const totalAmount = currencies.size === 1
    ? salesLeads.reduce((sum, l) => sum + parseFloat(l.saleTotalAmount ?? "0"), 0)
    : 0

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-[300px] flex flex-col rounded-lg border bg-ops-side p-2 transition-colors ${
        isOver ? "border-ops-blue" : "border-ops-line"
      }`}
    >
      {/* Header */}
      <div className="px-2 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div aria-hidden className="h-2 w-2 rounded-[2px] flex-shrink-0" style={{ background: stage.color }} />
          <span className="font-medium text-ops-tx text-[13px]">{stage.label}</span>
          <span className="font-plex tabular-nums text-xs text-ops-tx2">
            {leads.length}
          </span>
        </div>
        {totalAmount > 0 && (
          <span className="text-xs text-ops-green font-plex tabular-nums">${totalAmount.toFixed(0)}</span>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 overflow-y-auto min-h-[120px] max-h-[600px]">
        {leads.map((lead) => (
          <KanbanCard key={lead.id} lead={lead} onCardClick={onCardClick} />
        ))}
        {leads.length === 0 && (
          <div className="h-20 flex items-center justify-center rounded-md border border-dashed border-ops-bd text-ops-tx3 text-xs">
            Arrastra leads aquí
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Board ────────────────────────────────────────────────────────────────────

interface Props {
  funnel: Funnel
  initialLeads: LeadWithActivity[]
  salesReps?: SalesRep[]
  whatsappNumbers?: string[]
  clientId?: string
}

export function KanbanBoard({ funnel, initialLeads, salesReps = [], whatsappNumbers = [], clientId }: Props) {
  const router = useRouter()
  const mutated = useRef(false)
  const [leads, setLeads] = useState<LeadWithActivity[]>(initialLeads)
  const [activeCard, setActiveCard] = useState<LeadWithActivity | null>(null)
  const [drawerLead, setDrawerLead] = useState<LeadWithActivity | null>(null)
  const [, startTransition] = useTransition()

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setLeads(initialLeads), [initialLeads])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function handleDragStart({ active }: DragStartEvent) {
    setActiveCard(leads.find((l) => l.id === active.id) ?? null)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveCard(null)
    if (!over) return
    const leadId = active.id as string
    const newStage = over.id as LeadStage
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.stage === newStage) return

    const prevStage = lead.stage
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stage: newStage } : l))
    )
    startTransition(async () => {
      try {
        const result = await updateLeadStageAction(leadId, newStage)
        if (result?.error) {
          setLeads((prev) =>
            prev.map((l) => (l.id === leadId ? { ...l, stage: prevStage } : l))
          )
        }
      } catch {
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, stage: prevStage } : l))
        )
      }
    })
  }

  function handleCardClick(lead: LeadWithActivity) {
    setDrawerLead(lead)
  }

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-6 min-h-[400px]">
          {funnel.stages.map((stage) => (
            <KanbanColumn
              key={stage.stageKey}
              stage={stage}
              leads={leads.filter((l) => l.stage === stage.stageKey)}
              onCardClick={handleCardClick}
            />
          ))}
        </div>

        <DragOverlay>
          {activeCard && <KanbanCard lead={activeCard} isDragOverlay />}
        </DragOverlay>
      </DndContext>

      <LeadDrawer
        lead={drawerLead}
        open={!!drawerLead}
        onClose={() => {
          setDrawerLead(null)
          if (mutated.current) {
            mutated.current = false
            router.refresh()
          }
        }}
        onMutated={() => { mutated.current = true }}
        whatsappNumbers={whatsappNumbers}
        clientId={clientId}
        salesReps={salesReps}
      />
    </>
  )
}

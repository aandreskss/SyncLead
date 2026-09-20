"use client"

import { useState, useEffect, useTransition } from "react"
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
import { CSS } from "@dnd-kit/utilities"
import { updateLeadStageAction } from "@/domains/leads/actions"
import { LeadDrawer } from "@/app/dashboard/campaigns/[id]/leads/_components/LeadDrawer"
import type { Lead, Funnel, FunnelStageConfig, LeadStage, SalesRep } from "@/lib/db/schema"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tempBadge(t: string) {
  if (t === "hot") return "bg-red-500/15 text-red-400"
  if (t === "warm") return "bg-amber-500/15 text-amber-400"
  return "bg-blue-500/15 text-blue-400"
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
  lead: Lead
  isDragOverlay?: boolean
  onCardClick?: (lead: Lead) => void
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
      className={`rounded-lg border bg-zinc-950 p-3 cursor-grab active:cursor-grabbing select-none transition-opacity ${
        isDragging && !isDragOverlay ? "opacity-30 border-zinc-700" : "border-zinc-800 hover:border-zinc-700"
      }`}
    >
      <p className="font-medium text-zinc-100 text-sm truncate">{lead.name}</p>
      {lead.phone && (
        <p className="text-xs text-zinc-500 font-mono mt-0.5">{lead.phone}</p>
      )}
      <div className="flex items-center justify-between mt-2">
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${tempBadge(lead.temperature)}`}>
          {tempLabel(lead.temperature)}
        </span>
        <span className="text-xs text-zinc-700">{formatDate(lead.createdAt)}</span>
      </div>
      {lead.converted && (
        <p className="text-xs text-emerald-400 mt-1.5 font-medium">
          $ {parseFloat(lead.conversionAmount ?? "0").toFixed(2)}
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
  leads: Lead[]
  onCardClick: (lead: Lead) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.stageKey })

  const totalAmount = leads
    .filter((l) => l.converted)
    .reduce((sum, l) => sum + parseFloat(l.conversionAmount ?? "0"), 0)

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 flex flex-col rounded-xl border transition-colors ${
        isOver ? "border-indigo-500/50 bg-zinc-900/90" : "border-zinc-800 bg-zinc-900"
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: stage.color }} />
          <span className="font-medium text-zinc-100 text-sm">{stage.label}</span>
          <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full">
            {leads.length}
          </span>
        </div>
        {totalAmount > 0 && (
          <span className="text-xs text-emerald-400 font-mono">${totalAmount.toFixed(0)}</span>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[120px] max-h-[600px]">
        {leads.map((lead) => (
          <KanbanCard key={lead.id} lead={lead} onCardClick={onCardClick} />
        ))}
        {leads.length === 0 && (
          <div className="h-20 flex items-center justify-center text-zinc-700 text-xs">
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
  initialLeads: Lead[]
  salesReps?: SalesRep[]
  whatsappNumbers?: string[]
  clientId?: string
}

export function KanbanBoard({ funnel, initialLeads, salesReps = [], whatsappNumbers = [], clientId }: Props) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [activeCard, setActiveCard] = useState<Lead | null>(null)
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null)
  const [, startTransition] = useTransition()

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

  function handleCardClick(lead: Lead) {
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
          // No router.refresh() here to avoid kanban reload
        }}
        whatsappNumbers={whatsappNumbers}
        clientId={clientId}
        salesReps={salesReps}
      />
    </>
  )
}

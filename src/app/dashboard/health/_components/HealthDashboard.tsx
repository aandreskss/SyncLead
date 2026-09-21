"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Database, Send, Plug, RefreshCw } from "lucide-react"
import type { HealthSnapshot } from "@/domains/health/repository"
import {
  retryFailedCapiEventsAction,
  retryFailedImportAction,
  resolveStuckCronRunsAction,
} from "@/domains/health/actions"
import { Button } from "@/components/ui/button"
import { PageHeader, Panel, StatusChip, opsTable, opsField } from "@/components/app/ops"

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Tone = "green" | "amber" | "coral" | "neutral"

function formatDuration(ms: number | null): string {
  if (ms === null) return "—"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatAge(date: Date | null): string {
  if (!date) return "Nunca"
  const diffMs = Date.now() - new Date(date).getTime()
  const h = Math.floor(diffMs / 3600000)
  const m = Math.floor((diffMs % 3600000) / 60000)
  if (h > 48) return `${Math.floor(h / 24)} días`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function isSyncStale(date: Date | null): boolean {
  if (!date) return false
  return Date.now() - new Date(date).getTime() > 2 * 24 * 3600 * 1000
}

function StatusPanel({
  icon,
  title,
  tone,
  toneLabel,
  children,
}: {
  icon: React.ReactNode
  title: string
  tone: Tone
  toneLabel: string
  children: React.ReactNode
}) {
  return (
    <Panel className="flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex items-center gap-2.5 text-ops-tx2">
          <span aria-hidden>{icon}</span>
          <h2 className="text-sm font-semibold text-ops-tx">{title}</h2>
        </div>
        <StatusChip tone={tone}>{toneLabel}</StatusChip>
      </div>
      <div className="flex-1">{children}</div>
    </Panel>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-ops-line px-4 py-2.5 text-[13px]">
      <span className="text-ops-tx2">{label}</span>
      <span className="font-plex tabular-nums text-ops-tx text-right">{children}</span>
    </div>
  )
}

function ActionButton({
  label,
  onClick,
  disabled,
  variant = "secondary",
}: {
  label: string
  onClick: () => void
  disabled: boolean
  variant?: "secondary" | "destructive"
}) {
  return (
    <Button size="sm" variant={variant} onClick={onClick} disabled={disabled}>
      {disabled ? "..." : label}
    </Button>
  )
}

// ─── DB Card ──────────────────────────────────────────────────────────────────

function DbCard({ db }: { db: HealthSnapshot["db"] }) {
  return (
    <StatusPanel
      icon={<Database className="h-4 w-4" />}
      title="Base de datos"
      tone={db.ok ? "green" : "coral"}
      toneLabel={db.ok ? "Operativa" : "Error"}
    >
      <Row label="Conexión">
        <span className={db.ok ? "" : "text-ops-coral"}>{db.ok ? "Conectada" : "Error de conexión"}</span>
      </Row>
      <Row label="Latencia">{db.latencyMs}ms</Row>
    </StatusPanel>
  )
}

// ─── Meta Connections Card ────────────────────────────────────────────────────

function MetaConnectionsCard({ connections }: { connections: HealthSnapshot["metaConnections"] }) {
  const hasError = connections.some((c) => c.status !== "active")
  const anyStale = connections.some((c) => isSyncStale(c.lastSyncAt))
  const tone: Tone = connections.length === 0 ? "neutral" : hasError ? "coral" : anyStale ? "amber" : "green"
  const label =
    connections.length === 0 ? "Sin conexiones" : hasError ? "Error" : anyStale ? "Con pendientes" : "Operativa"

  return (
    <StatusPanel icon={<Plug className="h-4 w-4" />} title="Conexiones Meta" tone={tone} toneLabel={label}>
      {connections.length === 0 ? (
        <p className="border-t border-ops-line px-4 py-3 text-[13px] text-ops-tx2">Sin conexiones activas.</p>
      ) : (
        connections.map((c) => {
          const isStale = isSyncStale(c.lastSyncAt)
          const err = c.status !== "active"
          return (
            <div key={c.connectionId} className="border-t border-ops-line px-4 py-2.5 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-ops-tx">
                  {c.clientName ?? "Sin cliente"}
                  {c.adAccountId && <span className="ml-2 font-plex tabular-nums text-xs text-ops-tx3">{c.adAccountId}</span>}
                </span>
                {err && <StatusChip tone="coral">Error</StatusChip>}
              </div>
              <div className={`mt-0.5 text-xs ${isStale ? "text-ops-amber" : "text-ops-tx2"}`}>
                Último sync: <span className="font-plex tabular-nums">{formatAge(c.lastSyncAt)}</span>
                {" · "}
                <span className="font-plex tabular-nums">{c.lastSyncStatus ?? "—"}</span>
              </div>
              {c.lastSyncError && (
                <p className="mt-0.5 text-xs text-ops-coral">{c.lastSyncError.slice(0, 80)}</p>
              )}
            </div>
          )
        })
      )}
    </StatusPanel>
  )
}

// ─── CAPI Queue Card ──────────────────────────────────────────────────────────

function CapiQueueCard({
  queue,
  onRetry,
  pending,
}: {
  queue: HealthSnapshot["capiQueue"]
  onRetry: () => void
  pending: boolean
}) {
  const tone: Tone = queue.failed > 0 ? "coral" : queue.pending + queue.retrying > 0 ? "amber" : "green"
  const label = queue.failed > 0 ? "Error" : queue.pending + queue.retrying > 0 ? "Con pendientes" : "Operativa"
  return (
    <StatusPanel icon={<Send className="h-4 w-4" />} title="Cola CAPI" tone={tone} toneLabel={label}>
      <Row label="pending">{queue.pending}</Row>
      <Row label="retrying">{queue.retrying}</Row>
      <Row label="processing">{queue.processing}</Row>
      <Row label="sent">{queue.sent}</Row>
      <Row label="failed">
        <span className={queue.failed > 0 ? "text-ops-coral" : ""}>{queue.failed}</span>
      </Row>
      <Row label="skipped">{queue.skipped}</Row>
      {queue.failed > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-ops-line px-4 py-3">
          <span className="text-xs text-ops-coral">{queue.failed} evento(s) en dead-letter</span>
          <ActionButton label={`Reintentar fallidos (${queue.failed})`} onClick={onRetry} disabled={pending} />
        </div>
      )}
    </StatusPanel>
  )
}

// ─── Imports Card ─────────────────────────────────────────────────────────────

function ImportsCard({
  imports,
  onRetryImport,
  pending,
}: {
  imports: HealthSnapshot["activeImports"]
  onRetryImport: (batchId: string) => void
  pending: boolean
}) {
  return (
    <Panel title="Importaciones recientes con problemas">
      {imports.length === 0 ? (
        <p className="border-t border-ops-line px-4 py-4 text-[13px] text-ops-tx2">
          Sin importaciones con problemas en los últimos 30 días.
        </p>
      ) : (
        imports.map((b) => (
          <div
            key={b.batchId}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-ops-line px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="max-w-xs truncate font-plex tabular-nums text-ops-tx">
                  {b.originalFilename ?? b.batchId.slice(0, 8)}
                </span>
                <StatusChip tone={b.status === "failed" ? "coral" : "amber"}>{b.status}</StatusChip>
              </div>
              <div className="mt-1 text-xs text-ops-tx2">
                <span className="font-plex tabular-nums">{b.totalRows}</span> filas ·{" "}
                <span className="font-plex tabular-nums">{b.importedRows}</span> importadas ·{" "}
                <span className="font-plex tabular-nums">{b.failedRows}</span> fallidas
              </div>
            </div>
            {b.status === "failed" && (
              <ActionButton label="Reintentar" onClick={() => onRetryImport(b.batchId)} disabled={pending} />
            )}
          </div>
        ))
      )}
    </Panel>
  )
}

// ─── Cron History Card ────────────────────────────────────────────────────────

function cronTone(status: string): Tone {
  if (status === "completed") return "green"
  if (status === "failed") return "coral"
  if (status === "timeout") return "amber"
  return "neutral"
}

function CronHistoryCard({
  runs,
  stuck,
  onResolveStuck,
  pending,
}: {
  runs: HealthSnapshot["recentCronRuns"]
  stuck: HealthSnapshot["stuckCronRuns"]
  onResolveStuck: () => void
  pending: boolean
}) {
  return (
    <Panel title="Historial de crons">
      {stuck.length > 0 && (
        <div className="mx-4 mb-3 flex flex-wrap items-center gap-3 rounded-md border border-ops-amber/30 bg-ops-amber/10 px-3 py-2">
          <span className="text-xs text-ops-amber">
            {stuck.length} cron(s) en estado &quot;running&quot; por más de 10 minutos
          </span>
          <ActionButton label="Marcar como timeout" onClick={onResolveStuck} disabled={pending} variant="destructive" />
        </div>
      )}
      {runs.length === 0 ? (
        <p className="border-t border-ops-line px-4 py-4 text-[13px] text-ops-tx2">Sin ejecuciones registradas aún.</p>
      ) : (
        <div className={`${opsTable.wrap} max-h-96 overflow-y-auto`}>
          <table className={opsTable.table}>
            <thead>
              <tr>
                <th className={opsTable.th}>Tarea</th>
                <th className={opsTable.th}>Última ejecución</th>
                <th className={opsTable.thRight}>Duración</th>
                <th className={opsTable.th}>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className={opsTable.row}>
                  <td className={`${opsTable.td} font-plex tabular-nums`}>{r.jobName}</td>
                  <td className={`${opsTable.td} font-plex tabular-nums text-ops-tx2`}>
                    {new Date(r.startedAt)
                      .toLocaleString("es-VE", { hour12: false, timeZone: "America/Caracas" })
                      .slice(0, 16)}
                  </td>
                  <td className={`${opsTable.tdRight} font-plex tabular-nums`}>{formatDuration(r.durationMs)}</td>
                  <td className={opsTable.td}>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip tone={cronTone(r.status)}>{r.status}</StatusChip>
                      <span className="font-plex tabular-nums text-xs text-ops-tx2">
                        {r.itemsProcessed}↑
                        {r.itemsFailed > 0 && <span className="text-ops-coral"> {r.itemsFailed}✗</span>}
                      </span>
                      {r.error && <span className="max-w-xs truncate text-xs text-ops-coral">{r.error}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

// ─── Client Filter ────────────────────────────────────────────────────────────

function ClientFilter({
  clients,
  selectedClientId,
}: {
  clients: { id: string; name: string }[]
  selectedClientId?: string
}) {
  const router = useRouter()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    const url = val ? `/dashboard/health?clientId=${val}` : "/dashboard/health"
    router.push(url)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="health-client" className="shrink-0 text-xs text-ops-tx2">
        Filtrar por cliente:
      </label>
      <select
        id="health-client"
        value={selectedClientId ?? ""}
        onChange={handleChange}
        className={`${opsField} min-w-[220px] cursor-pointer`}
      >
        <option value="">Toda la organización</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {selectedClientId && <StatusChip tone="amber">Vista filtrada</StatusChip>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HealthDashboard({
  snapshot,
  clients,
  selectedClientId,
}: {
  snapshot: HealthSnapshot
  clients: { id: string; name: string }[]
  selectedClientId?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleCapiRetry() {
    startTransition(async () => {
      await retryFailedCapiEventsAction()
      window.location.reload()
    })
  }

  function handleImportRetry(batchId: string) {
    startTransition(async () => {
      await retryFailedImportAction(batchId)
      window.location.reload()
    })
  }

  function handleResolveStuck() {
    startTransition(async () => {
      await resolveStuckCronRunsAction()
      window.location.reload()
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Salud del sistema"
        subtitle="Estado de la base de datos, la cola CAPI y las conexiones con Meta."
        actions={
          <Button variant="secondary" onClick={() => router.refresh()}>
            <RefreshCw aria-hidden />
            Actualizar
          </Button>
        }
      />
      <ClientFilter clients={clients} selectedClientId={selectedClientId} />
      <div className="grid gap-4 lg:grid-cols-3">
        <DbCard db={snapshot.db} />
        <CapiQueueCard queue={snapshot.capiQueue} onRetry={handleCapiRetry} pending={isPending} />
        <MetaConnectionsCard connections={snapshot.metaConnections} />
      </div>
      <CronHistoryCard
        runs={snapshot.recentCronRuns}
        stuck={snapshot.stuckCronRuns}
        onResolveStuck={handleResolveStuck}
        pending={isPending}
      />
      <ImportsCard imports={snapshot.activeImports} onRetryImport={handleImportRetry} pending={isPending} />
    </div>
  )
}

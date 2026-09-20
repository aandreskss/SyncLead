"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import type { HealthSnapshot } from "@/domains/health/repository"
import {
  retryFailedCapiEventsAction,
  retryFailedImportAction,
  resolveStuckCronRunsAction,
} from "@/domains/health/actions"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${ok ? "bg-emerald-500" : "bg-red-500"}`}
    />
  )
}

function Badge({ label, count, variant = "neutral" }: { label: string; count: number; variant?: "ok" | "warn" | "error" | "neutral" }) {
  const colors = {
    ok: "bg-emerald-900/40 text-emerald-300",
    warn: "bg-yellow-900/40 text-yellow-300",
    error: "bg-red-900/40 text-red-300",
    neutral: "bg-zinc-800 text-zinc-400",
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${colors[variant]}`}>
      <span className="text-zinc-500">{label}:</span>
      {count}
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{title}</h2>
      {children}
    </div>
  )
}

function ActionButton({
  label,
  onClick,
  disabled,
  variant = "default",
}: {
  label: string
  onClick: () => void
  disabled: boolean
  variant?: "default" | "danger"
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        variant === "danger"
          ? "bg-red-900/40 text-red-300 hover:bg-red-900/60"
          : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
      }`}
    >
      {disabled ? "..." : label}
    </button>
  )
}

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

// ─── DB Card ──────────────────────────────────────────────────────────────────

function DbCard({ db }: { db: HealthSnapshot["db"] }) {
  return (
    <Section title="Base de datos">
      <div className="flex items-center gap-2 text-sm">
        <StatusDot ok={db.ok} />
        <span className={db.ok ? "text-zinc-200" : "text-red-400"}>
          {db.ok ? "Conectada" : "Error de conexión"}
        </span>
        <span className="text-zinc-600 text-xs">({db.latencyMs}ms)</span>
      </div>
    </Section>
  )
}

// ─── Meta Connections Card ────────────────────────────────────────────────────

function MetaConnectionsCard({ connections }: { connections: HealthSnapshot["metaConnections"] }) {
  if (connections.length === 0) {
    return (
      <Section title="Conexiones Meta">
        <p className="text-sm text-zinc-500">Sin conexiones activas.</p>
      </Section>
    )
  }
  return (
    <Section title="Conexiones Meta">
      <div className="space-y-2">
        {connections.map((c) => {
          const syncAgeMs = c.lastSyncAt ? Date.now() - new Date(c.lastSyncAt).getTime() : null
          const isStale = syncAgeMs !== null && syncAgeMs > 2 * 24 * 3600 * 1000
          const hasError = c.status !== "active"
          return (
            <div key={c.connectionId} className="flex items-start justify-between gap-3 py-1.5 border-b border-zinc-800 last:border-0">
              <div>
                <div className="flex items-center gap-2 text-sm">
                  <StatusDot ok={!hasError} />
                  <span className="text-zinc-200">{c.clientName ?? "Sin cliente"}</span>
                  {c.adAccountId && (
                    <span className="text-xs text-zinc-500 font-mono">{c.adAccountId}</span>
                  )}
                </div>
                {c.lastSyncError && (
                  <p className="text-xs text-red-400 mt-0.5 pl-5">{c.lastSyncError.slice(0, 80)}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className={`text-xs ${isStale ? "text-yellow-400" : "text-zinc-500"}`}>
                  Último sync: {formatAge(c.lastSyncAt)}
                </div>
                <div className="text-xs text-zinc-600">{c.lastSyncStatus ?? "—"}</div>
              </div>
            </div>
          )
        })}
      </div>
    </Section>
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
  return (
    <Section title="Cola CAPI">
      <div className="flex flex-wrap gap-2">
        <Badge label="pending" count={queue.pending} variant={queue.pending > 0 ? "warn" : "neutral"} />
        <Badge label="retrying" count={queue.retrying} variant={queue.retrying > 0 ? "warn" : "neutral"} />
        <Badge label="processing" count={queue.processing} variant="neutral" />
        <Badge label="sent" count={queue.sent} variant="ok" />
        <Badge label="failed" count={queue.failed} variant={queue.failed > 0 ? "error" : "neutral"} />
        <Badge label="skipped" count={queue.skipped} variant="neutral" />
      </div>
      {queue.failed > 0 && (
        <div className="flex items-center gap-3 pt-1">
          <span className="text-xs text-red-400">{queue.failed} evento(s) en dead-letter</span>
          <ActionButton
            label={`Reintentar fallidos (${queue.failed})`}
            onClick={onRetry}
            disabled={pending}
          />
        </div>
      )}
    </Section>
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
  if (imports.length === 0) return null
  return (
    <Section title="Importaciones recientes con problemas">
      <div className="space-y-2">
        {imports.map((b) => (
          <div key={b.batchId} className="flex items-center justify-between gap-3 py-1.5 border-b border-zinc-800 last:border-0">
            <div>
              <div className="flex items-center gap-2 text-sm">
                <StatusDot ok={b.status !== "failed"} />
                <span className="text-zinc-300 text-xs font-mono truncate max-w-xs">
                  {b.originalFilename ?? b.batchId.slice(0, 8)}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${b.status === "failed" ? "bg-red-900/40 text-red-300" : "bg-yellow-900/40 text-yellow-300"}`}>
                  {b.status}
                </span>
              </div>
              <div className="text-xs text-zinc-600 pl-5 mt-0.5">
                {b.totalRows} filas · {b.importedRows} importadas · {b.failedRows} fallidas
              </div>
            </div>
            {b.status === "failed" && (
              <ActionButton
                label="Reintentar"
                onClick={() => onRetryImport(b.batchId)}
                disabled={pending}
              />
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

// ─── Cron History Card ────────────────────────────────────────────────────────

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
    <Section title="Historial de crons">
      {stuck.length > 0 && (
        <div className="flex items-center gap-3 bg-yellow-900/20 border border-yellow-800/40 rounded px-3 py-2 mb-2">
          <span className="text-xs text-yellow-300">
            {stuck.length} cron(s) en estado "running" por más de 10 minutos
          </span>
          <ActionButton
            label="Marcar como timeout"
            onClick={onResolveStuck}
            disabled={pending}
            variant="danger"
          />
        </div>
      )}
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {runs.length === 0 && (
          <p className="text-sm text-zinc-500">Sin ejecuciones registradas aún.</p>
        )}
        {runs.map((r) => (
          <div key={r.id} className="flex items-center gap-3 text-xs py-1 font-mono">
            <span className="text-zinc-600 w-36 shrink-0">
              {new Date(r.startedAt).toLocaleString("es-VE", { hour12: false, timeZone: "America/Caracas" }).slice(0, 16)}
            </span>
            <span className="text-zinc-400 w-28 shrink-0">{r.jobName}</span>
            <span
              className={`w-20 shrink-0 ${
                r.status === "completed" ? "text-emerald-400"
                : r.status === "failed" ? "text-red-400"
                : r.status === "timeout" ? "text-yellow-400"
                : "text-zinc-500"
              }`}
            >
              {r.status}
            </span>
            <span className="text-zinc-600 w-16 shrink-0">{formatDuration(r.durationMs)}</span>
            <span className="text-zinc-500">
              {r.itemsProcessed}↑
              {r.itemsFailed > 0 && <span className="text-red-400"> {r.itemsFailed}✗</span>}
            </span>
            {r.error && (
              <span className="text-red-400 truncate max-w-xs">{r.error}</span>
            )}
          </div>
        ))}
      </div>
    </Section>
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
    <div className="flex items-center gap-3">
      <label className="text-xs text-zinc-500 shrink-0">Filtrar por cliente:</label>
      <select
        value={selectedClientId ?? ""}
        onChange={handleChange}
        className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-3 py-1.5 focus:outline-none focus:border-zinc-500"
      >
        <option value="">Toda la organización</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {selectedClientId && (
        <span className="text-xs text-amber-400 bg-amber-900/20 border border-amber-800/40 px-2 py-0.5 rounded">
          Vista filtrada
        </span>
      )}
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
    <div className="grid gap-4">
      <ClientFilter clients={clients} selectedClientId={selectedClientId} />
      <DbCard db={snapshot.db} />
      <MetaConnectionsCard connections={snapshot.metaConnections} />
      <CapiQueueCard
        queue={snapshot.capiQueue}
        onRetry={handleCapiRetry}
        pending={isPending}
      />
      <ImportsCard
        imports={snapshot.activeImports}
        onRetryImport={handleImportRetry}
        pending={isPending}
      />
      <CronHistoryCard
        runs={snapshot.recentCronRuns}
        stuck={snapshot.stuckCronRuns}
        onResolveStuck={handleResolveStuck}
        pending={isPending}
      />
    </div>
  )
}

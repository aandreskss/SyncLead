"use client"

import { useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  listProfilesAction,
  createProfileAction,
  publishProfileAction,
  archiveProfileAction,
} from "@/domains/qualification/profile-actions"
import type { QualificationProfile } from "@/domains/qualification/profile-types"
import { DEFAULT_THRESHOLDS } from "@/domains/qualification/profile-types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  FileText,
  Archive,
  Loader2,
  Settings2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import { ProfileRuleBuilder } from "./ProfileRuleBuilder"

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  clientId: string
  orgId: string
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: QualificationProfile["status"] }) {
  const map: Record<
    QualificationProfile["status"],
    { label: string; cls: string }
  > = {
    draft: { label: "Borrador", cls: "bg-zinc-700 text-zinc-300 hover:bg-zinc-700" },
    published: { label: "Publicado", cls: "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20" },
    archived: { label: "Archivado", cls: "bg-zinc-800 text-zinc-500 hover:bg-zinc-800" },
  }
  const s = map[status] ?? map.draft
  return <Badge className={`text-xs font-medium ${s.cls}`}>{s.label}</Badge>
}

// ─── Profile card ─────────────────────────────────────────────────────────────

function ProfileCard({
  profile,
  onEditRules,
  onPublish,
  onArchive,
}: {
  profile: QualificationProfile
  onEditRules: (profileId: string) => void
  onPublish: (profileId: string) => void
  onArchive: (profileId: string) => void
}) {
  const [publishPending, startPublish] = useTransition()
  const [archivePending, startArchive] = useTransition()
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handlePublish() {
    setError(null)
    startPublish(async () => {
      const r = await publishProfileAction(profile.id)
      if ("error" in r) setError(r.error ?? null)
      else onPublish(profile.id)
    })
  }

  function handleArchive() {
    startArchive(async () => {
      const r = await archiveProfileAction(profile.id)
      if ("error" in r) setError(r.error ?? null)
      else {
        setConfirmArchive(false)
        onArchive(profile.id)
      }
    })
  }

  const ruleCount = Array.isArray((profile as { rules?: unknown[] }).rules)
    ? (profile as { rules?: unknown[] }).rules!.length
    : 0

  return (
    <div className="border border-zinc-800 rounded-xl p-4 space-y-3 bg-zinc-900/40">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-100 truncate">{profile.name}</span>
            <StatusBadge status={profile.status} />
            <span className="text-xs text-zinc-600">v{profile.version}</span>
          </div>
          {profile.description && (
            <p className="text-xs text-zinc-500 line-clamp-2">{profile.description}</p>
          )}
          <p className="text-xs text-zinc-600">
            {ruleCount === 0 ? "Sin reglas" : `${ruleCount} regla${ruleCount !== 1 ? "s" : ""}`}
            {" · "}Score inicial: {profile.initialScore}
          </p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-1">
        {/* Editar reglas — available for draft profiles */}
        {profile.status === "draft" && (
          <button
            onClick={() => onEditRules(profile.id)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Editar reglas
          </button>
        )}

        {/* View only for non-draft */}
        {profile.status !== "draft" && (
          <button
            onClick={() => onEditRules(profile.id)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Ver reglas
          </button>
        )}

        {/* Publicar — only from draft */}
        {profile.status === "draft" && (
          <button
            onClick={handlePublish}
            disabled={publishPending || archivePending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-emerald-900/30 hover:text-emerald-400 text-zinc-300 transition-colors disabled:opacity-50"
          >
            {publishPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Publicar
          </button>
        )}

        {/* Archivar */}
        {profile.status !== "archived" && (
          confirmArchive ? (
            <>
              <button
                onClick={handleArchive}
                disabled={archivePending}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
              >
                {archivePending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
                Confirmar
              </button>
              <button
                onClick={() => setConfirmArchive(false)}
                disabled={archivePending}
                className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmArchive(true)}
              disabled={publishPending || archivePending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-red-900/30 hover:text-red-400 text-zinc-500 transition-colors disabled:opacity-50"
            >
              <Archive className="h-3.5 w-3.5" />
              Archivar
            </button>
          )
        )}
      </div>
    </div>
  )
}

// ─── New profile dialog ───────────────────────────────────────────────────────

function NewProfileDialog({
  clientId,
  open,
  onClose,
  onCreated,
}: {
  clientId: string
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    startTransition(async () => {
      const r = await createProfileAction({
        name: name.trim(),
        description: description.trim() || null,
        clientId,
        initialScore: 0,
        thresholds: DEFAULT_THRESHOLDS,
        resultLabels: {},
      })
      if ("error" in r) {
        setError(r.error ?? null)
      } else {
        setName("")
        setDescription("")
        onCreated()
        onClose()
      }
    })
  }

  function handleClose() {
    if (!pending) {
      setName("")
      setDescription("")
      setError(null)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Nuevo perfil de calificación</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Nombre *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Calificación Savaya"
              required
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:ring-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Descripción (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe el propósito de este perfil..."
              rows={3}
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 resize-none focus-visible:ring-indigo-500"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </p>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="submit"
              disabled={pending || !name.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {pending ? "Creando…" : "Crear perfil"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={pending}
              className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
            >
              Cancelar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function QualificationProfilesPanel({ clientId, orgId }: Props) {
  const router = useRouter()
  const [profiles, setProfiles] = useState<QualificationProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  async function loadProfiles() {
    setLoading(true)
    const r = await listProfilesAction()
    if ("profiles" in r && r.profiles) {
      // Filter to profiles for this client (or org-wide ones with no clientId)
      setProfiles(
        r.profiles.filter(
          (p) => p.clientId === clientId || p.clientId === null
        )
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    loadProfiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  function handleEditRules(profileId: string) {
    setSelectedProfileId(profileId)
    setSheetOpen(true)
  }

  function handleSheetClose() {
    setSheetOpen(false)
    setSelectedProfileId(null)
    router.refresh()
    loadProfiles()
  }

  function handleMutation() {
    router.refresh()
    loadProfiles()
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">Perfiles de calificación</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Define reglas basadas en puntuación para clasificar leads automáticamente.
          </p>
        </div>
        <button
          onClick={() => setShowNewDialog(true)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo perfil
        </button>
      </div>

      {/* Profiles list */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-zinc-800 rounded-xl">
          <FileText className="h-8 w-8 text-zinc-600 mb-3" />
          <p className="text-zinc-400 text-sm font-medium">Sin perfiles de calificación</p>
          <p className="text-zinc-600 text-xs mt-1">
            Crea un perfil para definir reglas de puntuación para este cliente.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              onEditRules={handleEditRules}
              onPublish={handleMutation}
              onArchive={handleMutation}
            />
          ))}
        </div>
      )}

      {/* New profile dialog */}
      <NewProfileDialog
        key={showNewDialog ? "open" : "closed"}
        clientId={clientId}
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onCreated={handleMutation}
      />

      {/* Rule builder sheet */}
      <Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) handleSheetClose() }}>
        <SheetContent
          className="w-full sm:max-w-2xl bg-zinc-950 border-zinc-800 p-0 overflow-y-auto"
        >
          {selectedProfileId && (
            <ProfileRuleBuilder
              profileId={selectedProfileId}
              clientId={clientId}
              onClose={handleSheetClose}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

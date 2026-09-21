"use client"

import { useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  listProfilesAction,
  createProfileAction,
  publishProfileAction,
  archiveProfileAction,
  reactivateProfileAction,
  deleteProfileAction,
} from "@/domains/qualification/profile-actions"
import {
  listRuleSetsAction,
  deactivateClientRuleSetsAction,
} from "@/domains/qualification/actions"
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
  TriangleAlert,
  Trash2,
  RotateCcw,
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
    draft: { label: "Borrador", cls: "bg-ops-sel text-ops-tx2 hover:bg-ops-sel" },
    published: { label: "Publicado", cls: "bg-emerald-500/20 text-ops-green hover:bg-emerald-500/20" },
    archived: { label: "Archivado", cls: "bg-ops-s2 text-ops-tx3 hover:bg-ops-s2" },
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
  onReactivate,
  onDelete,
}: {
  profile: QualificationProfile
  onEditRules: (profileId: string) => void
  onPublish: (profileId: string) => void
  onArchive: (profileId: string) => void
  onReactivate: (profileId: string) => void
  onDelete: (profileId: string) => void
}) {
  const [publishPending, startPublish] = useTransition()
  const [archivePending, startArchive] = useTransition()
  const [reactivatePending, startReactivate] = useTransition()
  const [deletePending, startDelete] = useTransition()
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const anyPending = publishPending || archivePending || reactivatePending || deletePending

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

  function handleReactivate() {
    setError(null)
    startReactivate(async () => {
      const r = await reactivateProfileAction(profile.id)
      if ("error" in r) setError(r.error ?? null)
      else onReactivate(profile.id)
    })
  }

  function handleDelete() {
    startDelete(async () => {
      const r = await deleteProfileAction(profile.id)
      if ("error" in r) {
        setError(r.error ?? null)
        setConfirmDelete(false)
      } else {
        onDelete(profile.id)
      }
    })
  }

  const ruleCount = Array.isArray((profile as { rules?: unknown[] }).rules)
    ? (profile as { rules?: unknown[] }).rules!.length
    : 0

  return (
    <div className="border border-ops-line rounded-lg p-4 space-y-3 bg-ops-s1/40">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-ops-tx truncate">{profile.name}</span>
            <StatusBadge status={profile.status} />
            <span className="text-xs text-ops-tx3">v{profile.version}</span>
          </div>
          {profile.description && (
            <p className="text-xs text-ops-tx3 line-clamp-2">{profile.description}</p>
          )}
          <p className="text-xs text-ops-tx3">
            {ruleCount === 0 ? "Sin reglas" : `${ruleCount} regla${ruleCount !== 1 ? "s" : ""}`}
            {" · "}Score inicial: {profile.initialScore}
          </p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-ops-coral flex items-center gap-1">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-1">
        {/* Editar reglas — draft only */}
        {profile.status === "draft" && (
          <button
            onClick={() => onEditRules(profile.id)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-ops-blue hover:bg-ops-blue/90 text-white transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Editar reglas
          </button>
        )}

        {/* Ver reglas — non-draft */}
        {profile.status !== "draft" && (
          <button
            onClick={() => onEditRules(profile.id)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-ops-s2 hover:bg-ops-sel text-ops-tx2 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Ver reglas
          </button>
        )}

        {/* Publicar — draft only */}
        {profile.status === "draft" && (
          <button
            onClick={handlePublish}
            disabled={anyPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-ops-s2 hover:bg-emerald-900/30 hover:text-ops-green text-ops-tx2 transition-colors disabled:opacity-50"
          >
            {publishPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Publicar
          </button>
        )}

        {/* Reactivar — archived only */}
        {profile.status === "archived" && (
          <button
            onClick={handleReactivate}
            disabled={anyPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-ops-s2 hover:bg-indigo-900/30 hover:text-ops-blue-t text-ops-tx2 transition-colors disabled:opacity-50"
          >
            {reactivatePending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Reactivar
          </button>
        )}

        {/* Archivar — draft or published */}
        {profile.status !== "archived" && (
          confirmArchive ? (
            <>
              <button
                onClick={handleArchive}
                disabled={anyPending}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
              >
                {archivePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                Confirmar
              </button>
              <button
                onClick={() => setConfirmArchive(false)}
                disabled={anyPending}
                className="text-xs px-3 py-1.5 rounded-lg bg-ops-s2 hover:bg-ops-sel text-ops-tx2 transition-colors"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmArchive(true)}
              disabled={anyPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-ops-s2 hover:bg-red-900/30 hover:text-ops-coral text-ops-tx3 transition-colors disabled:opacity-50"
            >
              <Archive className="h-3.5 w-3.5" />
              Archivar
            </button>
          )
        )}

        {/* Eliminar — always available */}
        {confirmDelete ? (
          <>
            <button
              onClick={handleDelete}
              disabled={anyPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
            >
              {deletePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Eliminar
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={anyPending}
              className="text-xs px-3 py-1.5 rounded-lg bg-ops-s2 hover:bg-ops-sel text-ops-tx2 transition-colors"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={anyPending}
            title="Eliminar perfil permanentemente"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-ops-s2 hover:bg-red-900/30 hover:text-ops-coral text-ops-tx3 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </button>
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
      <DialogContent className="bg-ops-s1 border-ops-line text-ops-tx max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ops-tx">Nuevo perfil de calificación</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-ops-tx2">Nombre *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Calificación Savaya"
              required
              className="bg-ops-s2 border-ops-bd text-ops-tx placeholder-ops-tx3 focus-visible:ring-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-ops-tx2">Descripción (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe el propósito de este perfil..."
              rows={3}
              className="bg-ops-s2 border-ops-bd text-ops-tx placeholder-ops-tx3 resize-none focus-visible:ring-indigo-500"
            />
          </div>

          {error && (
            <p className="text-xs text-ops-coral flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </p>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="submit"
              disabled={pending || !name.trim()}
              className="bg-ops-blue hover:bg-ops-blue/90 text-white disabled:opacity-50"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {pending ? "Creando…" : "Crear perfil"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={pending}
              className="border-ops-bd bg-ops-s2 text-ops-tx2 hover:bg-ops-sel hover:text-ops-tx"
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
  const [hasLegacyRules, setHasLegacyRules] = useState(false)
  const [deactivatingLegacy, startDeactivateLegacy] = useTransition()
  const [legacyError, setLegacyError] = useState<string | null>(null)

  async function loadProfiles() {
    setLoading(true)
    const [profilesRes, ruleSetsRes] = await Promise.all([
      listProfilesAction(),
      listRuleSetsAction(),
    ])
    if ("profiles" in profilesRes && profilesRes.profiles) {
      setProfiles(
        profilesRes.profiles.filter(
          (p) => p.clientId === clientId || p.clientId === null
        )
      )
    }
    if (Array.isArray(ruleSetsRes)) {
      setHasLegacyRules(
        ruleSetsRes.some((rs) => rs.clientId === clientId && rs.isActive)
      )
    }
    setLoading(false)
  }

  function handleDeactivateLegacy() {
    setLegacyError(null)
    startDeactivateLegacy(async () => {
      const r = await deactivateClientRuleSetsAction(clientId)
      if ("error" in r) {
        setLegacyError(r.error ?? null)
      } else {
        setHasLegacyRules(false)
      }
    })
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          <h2 className="text-base font-semibold text-ops-tx">Perfiles de calificación</h2>
          <p className="text-xs text-ops-tx3 mt-0.5">
            Define reglas basadas en puntuación para clasificar leads automáticamente.
          </p>
        </div>
        <button
          onClick={() => setShowNewDialog(true)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-ops-blue hover:bg-ops-blue/90 text-white transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo perfil
        </button>
      </div>

      {/* Profiles list */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-ops-tx3" />
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-ops-line rounded-lg">
          <FileText className="h-8 w-8 text-ops-tx3 mb-3" />
          <p className="text-ops-tx2 text-sm font-medium">Sin perfiles de calificación</p>
          <p className="text-ops-tx3 text-xs mt-1">
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
              onReactivate={handleMutation}
              onDelete={handleMutation}
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

      {/* Legacy rule sets warning */}
      {hasLegacyRules && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4 space-y-2">
          <div className="flex items-start gap-2">
            <TriangleAlert className="h-4 w-4 text-ops-amber flex-shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-sm font-medium text-ops-amber">Reglas legadas activas (v1)</p>
              <p className="text-xs text-amber-500/80">
                Este cliente tiene reglas de negocio/ciudad del sistema anterior. El perfil de calificación
                tiene prioridad, pero es recomendable desactivar las reglas legadas para evitar
                evaluaciones inesperadas si el perfil se archiva.
              </p>
            </div>
          </div>
          {legacyError && (
            <p className="text-xs text-ops-coral flex items-center gap-1 pl-6">
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              {legacyError}
            </p>
          )}
          <div className="pl-6">
            <button
              onClick={handleDeactivateLegacy}
              disabled={deactivatingLegacy}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-ops-amber transition-colors disabled:opacity-50"
            >
              {deactivatingLegacy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )}
              {deactivatingLegacy ? "Desactivando…" : "Desactivar reglas legadas"}
            </button>
          </div>
        </div>
      )}

      {/* Rule builder sheet */}
      <Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) handleSheetClose() }}>
        <SheetContent
          className="w-full sm:max-w-2xl bg-ops-bg border-ops-line p-0 overflow-y-auto"
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

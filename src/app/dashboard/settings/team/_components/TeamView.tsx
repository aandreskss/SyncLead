"use client"

import { useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"
import type { MemberWithUser } from "@/domains/members/repository"
import type { MemberRole } from "@/lib/db/schema"
import { updateMemberRoleAction, removeMemberAction } from "@/domains/members/actions"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader, Panel, StatusChip, opsTable, opsField, opsIconBtn } from "@/components/app/ops"
import InviteMemberDialog from "./InviteMemberDialog"
import ChangePasswordDialog from "./ChangePasswordDialog"

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  agent: "Agente",
  viewer: "Visor",
}

const ROLE_ORDER: MemberRole[] = ["owner", "admin", "manager", "agent", "viewer"]

const PERMISSIONS: { label: string; roles: MemberRole[] }[] = [
  { label: "Ver dashboard y métricas", roles: ["owner", "admin", "manager", "agent", "viewer"] },
  { label: "Trabajar leads asignados", roles: ["owner", "admin", "manager", "agent"] },
  { label: "Gestionar leads y campañas", roles: ["owner", "admin", "manager"] },
  { label: "Gestionar clientes", roles: ["owner", "admin"] },
  { label: "Gestionar equipo", roles: ["owner", "admin"] },
  { label: "Facturación y control total", roles: ["owner"] },
]

const ASSIGNABLE_BY: Record<string, MemberRole[]> = {
  owner: ["admin", "manager", "agent", "viewer"],
  admin: ["manager", "agent", "viewer"],
}

interface Props {
  members: MemberWithUser[]
  currentUserId: string
  currentUserRole: MemberRole
}

export default function TeamView({ members, currentUserId, currentUserRole }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canManage = currentUserRole === "owner" || currentUserRole === "admin"
  const assignableRoles = ASSIGNABLE_BY[currentUserRole] ?? []

  function canEditMember(member: MemberWithUser): boolean {
    if (!canManage) return false
    if (member.user.id === currentUserId) return false
    if (member.role === "owner") return false
    if (currentUserRole === "admin" && member.role === "admin") return false
    return true
  }

  function handleRoleChange(memberId: string, role: string) {
    setError(null)
    startTransition(async () => {
      const result = await updateMemberRoleAction(memberId, role as MemberRole)
      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  function handleRemove(memberId: string) {
    setError(null)
    startTransition(async () => {
      const result = await removeMemberAction(memberId)
      if (result.error) {
        setError(result.error)
        setConfirmRemoveId(null)
      } else {
        setConfirmRemoveId(null)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Equipo"
        subtitle="Miembros de tu organización y lo que puede hacer cada rol."
        actions={canManage ? <InviteMemberDialog currentUserRole={currentUserRole} /> : undefined}
      />

      {error && (
        <p role="alert" className="rounded-md border border-ops-coral/30 bg-ops-coral/10 px-4 py-3 text-sm text-ops-coral">
          {error}
        </p>
      )}

      <Panel
        title="Miembros"
        description={`${members.length} miembro${members.length !== 1 ? "s" : ""}`}
      >
        <div className={opsTable.wrap}>
          <table className={opsTable.table}>
            <thead>
              <tr>
                <th className={opsTable.th}>Miembro</th>
                <th className={opsTable.th}>Rol</th>
                <th className={opsTable.th}>Estado</th>
                <th className={opsTable.th}>Agregado</th>
                {canManage && <th className={opsTable.thRight}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const editable = canEditMember(member)
                const isSelf = member.user.id === currentUserId

                return (
                  <tr key={member.id} className={opsTable.row}>
                    <td className={opsTable.td}>
                      <div className="font-medium">
                        {member.user.name ?? "—"}
                        {isSelf && <span className="ml-2 text-xs font-normal text-ops-tx3">(tú)</span>}
                      </div>
                      <div className="text-xs text-ops-tx2">{member.user.email ?? "—"}</div>
                    </td>
                    <td className={opsTable.td}>
                      {editable ? (
                        <select
                          aria-label={`Rol de ${member.user.name ?? member.user.email ?? "miembro"}`}
                          value={member.role}
                          disabled={isPending}
                          onChange={(e) => handleRoleChange(member.id, e.target.value)}
                          className={`${opsField} h-8 cursor-pointer text-xs disabled:opacity-50`}
                        >
                          {assignableRoles.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <StatusChip tone={member.role === "owner" ? "blue" : "neutral"}>
                          {ROLE_LABELS[member.role]}
                        </StatusChip>
                      )}
                    </td>
                    <td className={opsTable.td}>
                      <StatusChip tone="green">Activo</StatusChip>
                    </td>
                    <td className={`${opsTable.td} font-plex tabular-nums text-ops-tx2`}>
                      {new Date(member.createdAt).toLocaleDateString("es-VE", { timeZone: "America/Caracas" })}
                    </td>
                    {canManage && (
                      <td className={opsTable.tdRight}>
                        {editable && (
                          <div className="flex items-center justify-end gap-1">
                            <ChangePasswordDialog memberId={member.id} memberName={member.user.name} />
                            {confirmRemoveId === member.id ? (
                              <>
                                <span className="text-xs text-ops-tx2">¿Confirmar?</span>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleRemove(member.id)}
                                  disabled={isPending}
                                >
                                  Eliminar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setConfirmRemoveId(null)}
                                  disabled={isPending}
                                >
                                  Cancelar
                                </Button>
                              </>
                            ) : (
                              <button
                                type="button"
                                aria-label={`Eliminar a ${member.user.name ?? member.user.email ?? "miembro"}`}
                                title="Eliminar"
                                onClick={() => setConfirmRemoveId(member.id)}
                                disabled={isPending}
                                className={`${opsIconBtn} hover:text-ops-coral disabled:opacity-50`}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Permisos por rol" description="Qué puede hacer cada rol dentro de la organización.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 h-9 border-y border-ops-line bg-ops-side px-3 text-left text-xs font-medium text-ops-tx3">
                  Permiso
                </th>
                {ROLE_ORDER.map((r) => (
                  <th key={r} className="h-9 border-y border-ops-line bg-ops-side px-3 text-center text-xs font-medium text-ops-tx3">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((perm) => (
                <tr key={perm.label} className={opsTable.row}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-ops-line bg-ops-s1 px-3 py-3 text-left font-normal text-ops-tx"
                  >
                    {perm.label}
                  </th>
                  {ROLE_ORDER.map((r) => (
                    <td key={r} className="border-b border-ops-line px-3 py-3 text-center">
                      {perm.roles.includes(r) ? (
                        <>
                          <Check className="mx-auto h-4 w-4 text-ops-green" aria-hidden />
                          <span className="sr-only">Sí</span>
                        </>
                      ) : (
                        <>
                          <span aria-hidden className="text-ops-tx3">—</span>
                          <span className="sr-only">No</span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

"use client"

import { useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import type { MemberWithUser } from "@/domains/members/repository"
import type { MemberRole } from "@/lib/db/schema"
import { updateMemberRoleAction, removeMemberAction } from "@/domains/members/actions"
import InviteMemberDialog from "./InviteMemberDialog"
import ChangePasswordDialog from "./ChangePasswordDialog"

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  agent: "Agente",
  viewer: "Visor",
}

const ROLE_COLORS: Record<MemberRole, string> = {
  owner: "bg-purple-900/40 text-purple-300 border border-purple-800/50",
  admin: "bg-blue-900/40 text-blue-300 border border-blue-800/50",
  manager: "bg-emerald-900/40 text-emerald-300 border border-emerald-800/50",
  agent: "bg-yellow-900/40 text-yellow-300 border border-yellow-800/50",
  viewer: "bg-zinc-800 text-zinc-400 border border-zinc-700",
}

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {members.length} miembro{members.length !== 1 ? "s" : ""}
        </p>
        {canManage && <InviteMemberDialog currentUserRole={currentUserRole} />}
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900/60 border-b border-zinc-800">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Usuario
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Rol
              </th>
              {canManage && (
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {members.map((member) => {
              const editable = canEditMember(member)
              const isSelf = member.user.id === currentUserId

              return (
                <tr
                  key={member.id}
                  className="bg-zinc-900 hover:bg-zinc-800/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-zinc-200">
                      {member.user.name ?? "—"}
                    </span>
                    {isSelf && (
                      <span className="ml-2 text-xs text-zinc-500">(tú)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {member.user.email ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {editable ? (
                      <select
                        value={member.role}
                        disabled={isPending}
                        onChange={(e) => handleRoleChange(member.id, e.target.value)}
                        className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-zinc-500 disabled:opacity-50 cursor-pointer"
                      >
                        {assignableRoles.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[member.role]}`}
                      >
                        {ROLE_LABELS[member.role]}
                      </span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      {editable && (
                        <div className="flex items-center justify-end gap-3">
                          <ChangePasswordDialog
                            memberId={member.id}
                            memberName={member.user.name}
                          />
                          {confirmRemoveId === member.id ? (
                            <>
                              <span className="text-xs text-zinc-400">¿Confirmar?</span>
                              <button
                                onClick={() => handleRemove(member.id)}
                                disabled={isPending}
                                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 font-medium"
                              >
                                Eliminar
                              </button>
                              <button
                                onClick={() => setConfirmRemoveId(null)}
                                disabled={isPending}
                                className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConfirmRemoveId(member.id)}
                              disabled={isPending}
                              className="text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
                            >
                              Eliminar
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

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-1">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Permisos por rol</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-zinc-500 mt-2">
          <span><span className="text-purple-400">Owner</span> — Control total, facturación</span>
          <span><span className="text-blue-400">Admin</span> — Gestiona clientes, campañas y equipo</span>
          <span><span className="text-emerald-400">Manager</span> — Gestiona leads y campañas</span>
          <span><span className="text-yellow-400">Agente</span> — Trabaja leads asignados</span>
          <span><span className="text-zinc-400">Visor</span> — Solo lectura del dashboard</span>
        </div>
      </div>
    </div>
  )
}

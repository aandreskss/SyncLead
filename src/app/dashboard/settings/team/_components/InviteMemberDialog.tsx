"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addMemberAction } from "@/domains/members/actions"
import type { AddMemberState } from "@/domains/members/actions"
import type { MemberRole } from "@/lib/db/schema"

const ROLES_BY_ACTOR: Record<string, { value: MemberRole; label: string; description: string }[]> = {
  owner: [
    { value: "admin", label: "Admin", description: "Gestiona clientes, campañas y equipo" },
    { value: "manager", label: "Manager", description: "Gestiona leads y campañas" },
    { value: "agent", label: "Agente", description: "Trabaja leads asignados" },
    { value: "viewer", label: "Visor", description: "Solo lectura" },
  ],
  admin: [
    { value: "manager", label: "Manager", description: "Gestiona leads y campañas" },
    { value: "agent", label: "Agente", description: "Trabaja leads asignados" },
    { value: "viewer", label: "Visor", description: "Solo lectura" },
  ],
}

interface Props {
  currentUserRole: MemberRole
}

export default function InviteMemberDialog({ currentUserRole }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<AddMemberState | undefined>()
  const formRef = useRef<HTMLFormElement>(null)

  const roles = ROLES_BY_ACTOR[currentUserRole] ?? []
  const isSuccess = result && !result.error

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const r = await addMemberAction(undefined, formData)
      setResult(r)
    })
  }

  function handleOpenChange(val: boolean) {
    if (!val && isSuccess) router.refresh()
    setOpen(val)
    if (!val) {
      setResult(undefined)
      formRef.current?.reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">+ Agregar miembro</Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Agregar miembro</DialogTitle>
        </DialogHeader>

        {isSuccess ? (
          <div className="space-y-4">
            {result.tempPassword ? (
              <div className="space-y-3">
                <div className="bg-amber-900/30 border border-amber-800 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-amber-300">Cuenta nueva creada</p>
                  <p className="text-sm text-amber-200/80">
                    No existía cuenta para <strong>{result.email}</strong>. Se creó con esta contraseña temporal:
                  </p>
                  <div className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 font-mono text-sm text-zinc-100 select-all">
                    {result.tempPassword}
                  </div>
                  <p className="text-xs text-amber-200/60">
                    Comparte esta contraseña con el usuario. Puede cambiarla después.
                  </p>
                </div>
                <Button className="w-full" onClick={() => handleOpenChange(false)}>
                  Listo
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-emerald-400">
                  Miembro agregado correctamente.
                </p>
                <Button className="w-full" onClick={() => handleOpenChange(false)}>
                  Cerrar
                </Button>
              </div>
            )}
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email" className="text-zinc-300 text-sm">
                Email
              </Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                placeholder="usuario@ejemplo.com"
                required
                disabled={isPending}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-0 focus:border-zinc-500"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-role" className="text-zinc-300 text-sm">
                Rol
              </Label>
              <select
                id="invite-role"
                name="role"
                disabled={isPending}
                defaultValue={roles[0]?.value}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-md px-3 py-2 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
              >
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} — {r.description}
                  </option>
                ))}
              </select>
            </div>

            {result?.error && (
              <p className="text-sm text-red-400">{result.error}</p>
            )}

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Agregando..." : "Agregar"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

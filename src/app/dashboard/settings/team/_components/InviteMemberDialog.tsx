"use client"

import { useState, useTransition, useRef, useId } from "react"
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
  const [showPassword, setShowPassword] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const pwId = useId()

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
                    Se creó la cuenta para <strong>{result.email}</strong> con esta contraseña:
                  </p>
                  <div className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 font-mono text-sm text-zinc-100 select-all">
                    {result.tempPassword}
                  </div>
                  <p className="text-xs text-amber-200/60">
                    Comparte estas credenciales con el usuario para que pueda iniciar sesión.
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

            <div className="space-y-1.5">
              <Label htmlFor={pwId} className="text-zinc-300 text-sm">
                Contraseña <span className="text-zinc-500 font-normal">(min. 8 caracteres)</span>
              </Label>
              <div className="relative">
                <Input
                  id={pwId}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Escribe la contraseña del usuario"
                  minLength={8}
                  disabled={isPending}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-0 focus:border-zinc-500 pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-200 px-1"
                >
                  {showPassword ? "Ocultar" : "Ver"}
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                Si lo dejas vacío se genera una contraseña automáticamente.
              </p>
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

"use client"

import { useState, useTransition, useRef, useId } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addMemberAction } from "@/domains/members/actions"
import type { AddMemberState } from "@/domains/members/actions"
import { opsField } from "@/components/app/ops"
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
        <Button>Agregar miembro</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar miembro</DialogTitle>
          <DialogDescription>Crea el acceso de un nuevo integrante y asígnale un rol.</DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div className="space-y-4">
            {result.tempPassword ? (
              <div className="space-y-3">
                <div className="bg-ops-amber/10 border border-ops-amber/30 rounded-md p-4 space-y-2">
                  <p className="text-sm font-medium text-ops-amber">Cuenta nueva creada</p>
                  <p className="text-sm text-ops-tx">
                    Se creó la cuenta para <strong>{result.email}</strong> con esta contraseña:
                  </p>
                  <div className="bg-ops-s1 border border-ops-bd rounded-md px-3 py-2 font-plex tabular-nums text-sm text-ops-tx select-all">
                    {result.tempPassword}
                  </div>
                  <p className="text-xs text-ops-tx2">
                    Comparte estas credenciales con el usuario para que pueda iniciar sesión.
                  </p>
                </div>
                <Button onClick={() => handleOpenChange(false)}>
                  Listo
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-ops-green">
                  Miembro agregado correctamente.
                </p>
                <Button onClick={() => handleOpenChange(false)}>
                  Cerrar
                </Button>
              </div>
            )}
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email" className="text-sm text-ops-tx">
                Email
              </Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                placeholder="usuario@ejemplo.com"
                required
                disabled={isPending}
               
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-role" className="text-sm text-ops-tx">
                Rol
              </Label>
              <select
                id="invite-role"
                name="role"
                disabled={isPending}
                defaultValue={roles[0]?.value}
                className={`${opsField} w-full disabled:opacity-50`}
              >
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} — {r.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={pwId} className="text-sm text-ops-tx">
                Contraseña <span className="text-ops-tx3 font-normal">(min. 8 caracteres)</span>
              </Label>
              <div className="relative">
                <Input
                  id={pwId}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Escribe la contraseña del usuario"
                  minLength={8}
                  disabled={isPending}
                  className="pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ops-tx2 hover:text-ops-tx px-1 rounded focus-visible:outline-2 focus-visible:outline-ops-blue"
                >
                  {showPassword ? "Ocultar" : "Ver"}
                </button>
              </div>
              <p className="text-xs text-ops-tx2">
                Si lo dejas vacío se genera una contraseña automáticamente.
              </p>
            </div>

            {result?.error && (
              <p className="text-sm text-ops-coral">{result.error}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Agregando..." : "Agregar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

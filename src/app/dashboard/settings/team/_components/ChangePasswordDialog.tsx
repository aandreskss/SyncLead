"use client"

import { useState, useTransition, useRef, useId } from "react"
import { KeyRound } from "lucide-react"
import { opsIconBtn } from "@/components/app/ops"
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
import { resetMemberPasswordAction } from "@/domains/members/actions"

interface Props {
  memberId: string
  memberName: string | null
}

export default function ChangePasswordDialog({ memberId, memberName }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const pwId = useId()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const password = (new FormData(e.currentTarget).get("password") as string).trim()
    setError(null)
    startTransition(async () => {
      try {
        const result = await resetMemberPasswordAction(memberId, password)
        if (result.error) {
          setError(result.error)
        } else {
          setSuccess(true)
        }
      } catch {
        setError("Error inesperado. Intenta de nuevo.")
      }
    })
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) {
      setError(null)
      setSuccess(false)
      setShowPassword(false)
      formRef.current?.reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Cambiar contraseña de ${memberName ?? "este usuario"}`}
          title="Cambiar contraseña"
          className={opsIconBtn}
        >
          <KeyRound className="h-4 w-4" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>
            Nueva contraseña para {memberName ?? "este usuario"}.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4">
            <p className="text-sm text-ops-green">
              Contraseña actualizada para <strong>{memberName ?? "el usuario"}</strong>.
            </p>
            <Button onClick={() => handleOpenChange(false)}>
              Cerrar
            </Button>
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={pwId} className="text-sm text-ops-tx">
                Nueva contraseña
              </Label>
              <div className="relative">
                <Input
                  id={pwId}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
                  disabled={isPending}
                  className="pr-16"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ops-tx2 hover:text-ops-tx px-1 rounded focus-visible:outline-2 focus-visible:outline-ops-blue"
                >
                  {showPassword ? "Ocultar" : "Ver"}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-ops-coral">{error}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Guardando…" : "Guardar contraseña"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

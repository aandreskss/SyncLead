"use client"

import { useState, useTransition, useRef, useId } from "react"
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
        <button className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Contraseña
        </button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Cambiar contraseña</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="space-y-4">
            <p className="text-sm text-emerald-400">
              Contraseña actualizada para <strong>{memberName ?? "el usuario"}</strong>.
            </p>
            <Button className="w-full" onClick={() => handleOpenChange(false)}>
              Cerrar
            </Button>
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-zinc-400">
              Nueva contraseña para <strong className="text-zinc-200">{memberName ?? "este usuario"}</strong>.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor={pwId} className="text-zinc-300 text-sm">
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
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-0 focus:border-zinc-500 pr-16"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-200 px-1"
                >
                  {showPassword ? "Ocultar" : "Ver"}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

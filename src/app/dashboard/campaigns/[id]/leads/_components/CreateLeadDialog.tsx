"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X, UserPlus } from "lucide-react"
import { createLeadManuallyAction } from "@/domains/leads/actions"

interface Props {
  campaignId: string
  onClose: () => void
}

export function CreateLeadDialog({ campaignId, onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const input = {
      name: fd.get("name") as string,
      phone: (fd.get("phone") as string) || null,
      email: (fd.get("email") as string) || null,
      city: (fd.get("city") as string) || null,
      negocio: (fd.get("negocio") as string) || null,
    }
    startTransition(async () => {
      try {
        const result = await createLeadManuallyAction(campaignId, input)
        if (!result.success) {
          setError(result.error ?? "Error al crear el lead")
        } else {
          router.refresh()
          onClose()
        }
      } catch {
        setError("Error inesperado")
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-xl border border-ops-bd bg-ops-s1 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ops-line px-6 py-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-ops-blue-t" />
            <h2 className="text-sm font-semibold text-ops-tx">Nuevo lead manual</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-ops-tx3 hover:text-ops-tx transition-colors focus-visible:outline-2 focus-visible:outline-ops-blue"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-ops-tx2 mb-1.5">
              Nombre <span className="text-ops-coral">*</span>
            </label>
            <input
              name="name"
              type="text"
              required
              placeholder="Ej. Juan Pérez"
              className="w-full rounded-lg border border-ops-bd bg-ops-s2 px-3 py-2 text-sm text-ops-tx placeholder-ops-tx3 focus:outline-none focus:border-ops-blue transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ops-tx2 mb-1.5">Teléfono</label>
            <input
              name="phone"
              type="tel"
              placeholder="Ej. +58 412 123 4567"
              className="w-full rounded-lg border border-ops-bd bg-ops-s2 px-3 py-2 text-sm text-ops-tx placeholder-ops-tx3 focus:outline-none focus:border-ops-blue transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ops-tx2 mb-1.5">Email</label>
            <input
              name="email"
              type="email"
              placeholder="Ej. juan@ejemplo.com"
              className="w-full rounded-lg border border-ops-bd bg-ops-s2 px-3 py-2 text-sm text-ops-tx placeholder-ops-tx3 focus:outline-none focus:border-ops-blue transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ops-tx2 mb-1.5">Ciudad</label>
              <input
                name="city"
                type="text"
                placeholder="Ej. Caracas"
                className="w-full rounded-lg border border-ops-bd bg-ops-s2 px-3 py-2 text-sm text-ops-tx placeholder-ops-tx3 focus:outline-none focus:border-ops-blue transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ops-tx2 mb-1.5">¿Tiene negocio?</label>
              <select
                name="negocio"
                className="w-full rounded-lg border border-ops-bd bg-ops-s2 px-3 py-2 text-sm text-ops-tx2 focus:outline-none focus:border-ops-blue transition-colors"
              >
                <option value="">Sin especificar</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-ops-coral/10 border border-ops-coral/30 px-3 py-2 text-xs text-ops-coral">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 rounded-lg border border-ops-bd px-4 py-2 text-sm text-ops-tx2 hover:text-ops-tx hover:bg-ops-hover transition-colors focus-visible:outline-2 focus-visible:outline-ops-blue"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-lg bg-ops-blue px-4 py-2 text-sm font-medium text-white hover:bg-ops-blue/90 disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-ops-blue"
            >
              {isPending ? "Creando…" : "Crear lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

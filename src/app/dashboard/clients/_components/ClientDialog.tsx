"use client"

import { useRef, useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createClientAction, updateClientAction } from "@/domains/clients/actions"
import type { Client } from "@/lib/db/schema"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  client?: Client | null
}

const inputClass =
  "w-full rounded-md border border-ops-bd bg-ops-s2 px-3 py-2 text-sm text-ops-tx placeholder:text-ops-tx3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"

export function ClientDialog({ open, onOpenChange, client }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const isEdit = !!client

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const action = isEdit ? updateClientAction : createClientAction
      const result = await action(undefined, formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      formRef.current?.reset()
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog key={client?.id ?? "new"} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica los datos del cliente. El token de acceso solo se actualiza si introduces uno nuevo."
              : "Agrega un cliente con su configuración de Meta Ads."}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {isEdit && <input type="hidden" name="clientId" value={client.id} />}

          <div className="space-y-1.5">
            <Label htmlFor="cl-name" className="text-ops-tx2">
              Nombre del cliente <span className="text-red-500">*</span>
            </Label>
            <input
              id="cl-name"
              name="name"
              type="text"
              required
              maxLength={100}
              defaultValue={client?.name ?? ""}
              placeholder="Ej: Savaya Venezuela"
              className={inputClass}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cl-pixel" className="text-ops-tx2">
                Meta Pixel ID
              </Label>
              <input
                id="cl-pixel"
                name="pixelId"
                type="text"
                inputMode="numeric"
                defaultValue={client?.metaPixelId ?? ""}
                placeholder="2735539505…"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-dataset" className="text-ops-tx2">
                Dataset ID (CAPI)
              </Label>
              <input
                id="cl-dataset"
                name="datasetId"
                type="text"
                inputMode="numeric"
                defaultValue={client?.metaDatasetId ?? ""}
                placeholder="Igual al Pixel ID"
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cl-token" className="text-ops-tx2">
              Access Token — Conversions API
            </Label>
            <input
              id="cl-token"
              name="accessToken"
              type="password"
              placeholder={isEdit ? "Dejar vacío para mantener el actual" : "EAABwz…"}
              className={inputClass}
            />
            <p className="text-xs text-ops-tx3">
              Cifrado con AES-256-GCM. Nunca se muestra en claro.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cl-wa" className="text-ops-tx2">
              Números de WhatsApp
            </Label>
            <Textarea
              id="cl-wa"
              name="whatsappNumbers"
              rows={3}
              defaultValue={(client?.whatsappNumbers ?? []).join("\n")}
              placeholder={"584141100100\n584241234567"}
            />
            <p className="text-xs text-ops-tx3">Un número por línea, con código de país (sin +).</p>
          </div>

          {error && (
            <p className="text-sm text-ops-coral bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="text-ops-tx2 hover:text-ops-tx hover:bg-ops-s2"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-ops-blue hover:bg-ops-blue/90 text-white"
              disabled={pending}
            >
              {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

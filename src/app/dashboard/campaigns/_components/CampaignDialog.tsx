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
import { Globe, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { createCampaignAction, updateCampaignAction } from "@/domains/campaigns/actions"
import type { Campaign, Client } from "@/lib/db/schema"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaign?: Campaign | null
  clients: Client[]
}

const inputClass =
  "w-full rounded-md border border-ops-bd bg-ops-s2 px-3 py-2 text-sm text-ops-tx placeholder:text-ops-tx3 focus:outline-none focus:ring-2 focus-visible:ring-ops-blue focus:border-transparent disabled:opacity-50"

export function CampaignDialog({ open, onOpenChange, campaign, clients }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [channelType, setChannelType] = useState<"web_form" | "messaging">(
    (campaign?.channelType as "web_form" | "messaging") ?? "web_form"
  )
  const formRef = useRef<HTMLFormElement>(null)

  const isEdit = !!campaign

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const action = isEdit ? updateCampaignAction : createCampaignAction
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
    <Dialog key={campaign?.id ?? "new"} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar campaña" : "Nueva campaña"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cambia el nombre de la campaña. El cliente y la API key no cambian aquí."
              : "Crea una campaña y obtén su API key para conectar tu landing page."}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {isEdit && <input type="hidden" name="campaignId" value={campaign.id} />}
          <input type="hidden" name="channelType" value={channelType} />

          {/* Tipo de campaña — solo editable en creación */}
          <div className="space-y-1.5">
            <Label className="text-ops-tx">Tipo de campaña</Label>
            {isEdit ? (
              <div className="flex items-center gap-2 rounded-lg border border-ops-bd bg-ops-s2/50 px-3 py-2">
                {channelType === "messaging"
                  ? <MessageSquare className="h-3.5 w-3.5 text-ops-blue" />
                  : <Globe className="h-3.5 w-3.5 text-ops-tx3" />}
                <span className="text-sm text-ops-tx2">
                  {channelType === "messaging" ? "Mensajes (WA / IG)" : "Web / Formularios"}
                </span>
                <span className="ml-auto text-xs text-ops-tx3">No se puede cambiar</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: "web_form", icon: <Globe className="h-4 w-4" />, label: "Web / Formularios", sub: "Pixel, landing pages, forms" },
                  { value: "messaging", icon: <MessageSquare className="h-4 w-4" />, label: "Mensajes (WA / IG)", sub: "WhatsApp CTWA, Instagram DM" },
                ] as const).map(({ value, icon, label, sub }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setChannelType(value)}
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors",
                      channelType === value
                        ? "border-ops-blue bg-ops-blue/5 text-ops-blue"
                        : "border-ops-bd bg-ops-s2 text-ops-tx2 hover:border-ops-blue/40 hover:text-ops-tx"
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {icon}
                      <span className="text-xs font-semibold">{label}</span>
                    </div>
                    <span className="text-[10px] text-ops-tx3 leading-snug">{sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-name" className="text-ops-tx">
              Nombre de la campaña <span className="text-ops-coral">*</span>
            </Label>
            <input
              id="cp-name"
              name="name"
              type="text"
              required
              maxLength={120}
              defaultValue={campaign?.name ?? ""}
              placeholder="Ej: Zapatos Primavera 2025"
              className={inputClass}
              autoFocus
            />
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-client" className="text-ops-tx">
                Cliente <span className="text-ops-coral">*</span>
              </Label>
              {clients.length === 0 ? (
                <p className="text-sm text-ops-amber bg-ops-amber/10 border border-ops-amber/20 rounded-md px-3 py-2">
                  No tienes clientes todavía. Crea uno primero en la sección de Clientes.
                </p>
              ) : (
                <select
                  id="cp-client"
                  name="clientId"
                  required
                  className={inputClass}
                  defaultValue=""
                >
                  <option value="" disabled>Selecciona un cliente…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {isEdit && (
            <div className="space-y-1.5">
              <Label className="text-ops-tx">Cliente</Label>
              <p className="text-sm text-ops-tx3 bg-ops-s2/50 border border-ops-bd rounded-md px-3 py-2">
                El cliente no se puede cambiar después de crear la campaña.
              </p>
            </div>
          )}

          {channelType === "web_form" && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-utm" className="text-ops-tx">
                Clave UTM de campaña <span className="text-ops-tx3 font-normal">(opcional)</span>
              </Label>
              <input
                id="cp-utm"
                name="utmCampaignKey"
                type="text"
                maxLength={200}
                defaultValue={campaign?.utmCampaignKey ?? ""}
                placeholder="Ej: producto-a-2025"
                className={inputClass}
              />
              <p className="text-xs text-ops-tx3">
                Valor exacto de <code className="text-ops-tx2">utm_campaign</code> que usas en Meta Ads para esta campaña.
                El pixel asignará automáticamente los leads que lleguen con ese UTM.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-ops-coral bg-ops-coral/10 border border-ops-coral/20 rounded-md px-3 py-2">
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
              className="bg-ops-blue hover:bg-ops-blue text-white"
              disabled={pending || (clients.length === 0 && !isEdit)}
            >
              {pending ? "Guardando…" : isEdit ? "Guardar" : "Crear campaña"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

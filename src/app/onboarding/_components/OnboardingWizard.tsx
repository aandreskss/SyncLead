"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createOrgAction, createFirstClientAction, skipClientAction } from "../actions"

const STEPS = [
  { label: "Tu espacio", description: "Configura tu workspace" },
  { label: "Primer cliente", description: "Conecta tu primer cliente Meta" },
  { label: "Listo", description: "Todo configurado" },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-8">
      {STEPS.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
              i < current
                ? "bg-indigo-600 text-white"
                : i === current
                ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-600"
                : "bg-zinc-100 text-zinc-400"
            }`}
          >
            {i < current ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              i + 1
            )}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-px w-12 ${i < current ? "bg-indigo-600" : "bg-zinc-200"}`} />
          )}
        </div>
      ))}
    </div>
  )
}

function Step1({ onNext }: { onNext: (orgId: string) => void }) {
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setError("")
    startTransition(async () => {
      try {
        const result = await createOrgAction(formData)
        if ("error" in result && result.error) {
          setError(result.error)
        } else if ("orgId" in result && result.orgId) {
          onNext(result.orgId)
        }
      } catch {
        setError("Error inesperado. Intenta de nuevo.")
      }
    })
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Nombra tu workspace</CardTitle>
        <CardDescription>
          Este es el nombre de tu cuenta o agencia. Puedes cambiarlo después.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="orgName">Nombre del workspace</Label>
            <Input
              id="orgName"
              name="orgName"
              placeholder="Ej: Mi Agencia Digital"
              required
              minLength={2}
              maxLength={60}
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={pending}>
            {pending ? "Guardando…" : "Continuar →"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function Step2({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const [skipping, startSkipTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setError("")
    startTransition(async () => {
      try {
        const result = await createFirstClientAction(formData)
        if (result?.error) {
          setError(result.error)
        } else {
          onNext()
        }
      } catch {
        setError("Error inesperado. Intenta de nuevo.")
      }
    })
  }

  function handleSkip() {
    startSkipTransition(async () => {
      await skipClientAction()
    })
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Conecta tu primer cliente</CardTitle>
        <CardDescription>
          Agrega una marca o negocio con su Pixel de Meta. Puedes agregar más clientes después.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="clientName">
              Nombre del cliente <span className="text-red-500">*</span>
            </Label>
            <Input
              id="clientName"
              name="clientName"
              placeholder="Ej: Savaya Venezuela"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pixelId">Meta Pixel ID</Label>
            <Input
              id="pixelId"
              name="pixelId"
              placeholder="Ej: 27355395054120748"
              inputMode="numeric"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accessToken">
              Access Token — Conversions API
            </Label>
            <Input
              id="accessToken"
              name="accessToken"
              type="password"
              placeholder="EAABwz…"
            />
            <p className="text-xs text-zinc-400">
              Lo encontrarás en Meta Events Manager → Configuración. Se cifra con AES-256 antes de guardarse.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="whatsappNumbers">Números de WhatsApp de vendedores</Label>
            <textarea
              id="whatsappNumbers"
              name="whatsappNumbers"
              className="w-full min-h-[72px] rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              placeholder={"584141100100\n584241234567"}
            />
            <p className="text-xs text-zinc-400">Un número por línea, con código de país (sin +).</p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleSkip}
              disabled={skipping || pending}
            >
              {skipping ? "Saltando…" : "Saltar por ahora"}
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              disabled={pending || skipping}
            >
              {pending ? "Guardando…" : "Continuar →"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Step3({ onFinish }: { onFinish: () => void }) {
  const [pending, startTransition] = useTransition()

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-8 pb-8 text-center space-y-5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="space-y-1">
          <h3 className="text-xl font-semibold">¡Todo listo!</h3>
          <p className="text-sm text-zinc-500">
            Tu workspace está configurado. Los leads de tus campañas aparecerán aquí en tiempo real.
          </p>
        </div>
        <Button
          className="bg-indigo-600 hover:bg-indigo-700 px-8"
          onClick={() => {
            startTransition(() => {
              onFinish()
            })
          }}
          disabled={pending}
        >
          {pending ? "Entrando…" : "Ir al dashboard →"}
        </Button>
      </CardContent>
    </Card>
  )
}

export function OnboardingWizard() {
  const [step, setStep] = useState(0)
  const [orgId, setOrgId] = useState("")
  const router = useRouter()

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-2">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-indigo-600">SyncLead</h1>
          <p className="text-sm text-zinc-500 mt-1">Configuración inicial</p>
        </div>

        <StepIndicator current={step} />

        {step === 0 && (
          <Step1
            onNext={(id) => {
              setOrgId(id)
              setStep(1)
            }}
          />
        )}

        {step === 1 && (
          <Step2
            onNext={() => setStep(2)}
            onSkip={() => router.push("/dashboard")}
          />
        )}

        {step === 2 && <Step3 onFinish={() => router.push("/dashboard")} />}
      </div>
    </div>
  )
}

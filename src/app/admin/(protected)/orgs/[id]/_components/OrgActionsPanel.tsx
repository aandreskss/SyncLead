"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateOrgPlanAction, toggleOrgSuspendedAction, updateOrgFeaturesAction } from "@/app/admin/(protected)/_actions"
import { PLAN_OPTIONS, FEATURE_DEFINITIONS } from "@/lib/admin/definitions"

interface Props {
  orgId: string
  currentPlan: string
  suspended: boolean
  features: Record<string, boolean>
}

export function OrgActionsPanel({ orgId, currentPlan, suspended, features }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [plan, setPlan] = useState(currentPlan)
  const [featureMap, setFeatureMap] = useState<Record<string, boolean>>(features)

  function notify(msg: string) {
    setSuccess(msg)
    setError(null)
    setTimeout(() => setSuccess(null), 3000)
  }

  function handlePlanChange(newPlan: string) {
    setPlan(newPlan)
    startTransition(async () => {
      try {
        const r = await updateOrgPlanAction(orgId, newPlan)
        if (r.error) { setError(r.error); setPlan(currentPlan) }
        else { notify("Plan actualizado"); router.refresh() }
      } catch { setError("Error al actualizar el plan") }
    })
  }

  function handleToggleSuspend() {
    startTransition(async () => {
      try {
        const r = await toggleOrgSuspendedAction(orgId, !suspended)
        if (r.error) setError(r.error)
        else { notify(suspended ? "Org reactivada" : "Org suspendida"); router.refresh() }
      } catch { setError("Error al cambiar estado") }
    })
  }

  function handleFeatureToggle(key: string, value: boolean) {
    const next = { ...featureMap, [key]: value }
    setFeatureMap(next)
    startTransition(async () => {
      try {
        const r = await updateOrgFeaturesAction(orgId, next)
        if (r.error) { setError(r.error); setFeatureMap(featureMap) }
        else notify("Feature actualizada")
      } catch { setError("Error al actualizar features") }
    })
  }

  const card: React.CSSProperties = {
    background: "#18181b", border: "1px solid #27272a", borderRadius: 12, padding: 20,
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Feedback */}
      {error && (
        <div style={{
          background: "#3b1a1a", border: "1px solid #7f1d1d",
          borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13,
        }}>{error}</div>
      )}
      {success && (
        <div style={{
          background: "#14251a", border: "1px solid #166534",
          borderRadius: 8, padding: "10px 14px", color: "#86efac", fontSize: 13,
        }}>{success}</div>
      )}

      {/* Plan */}
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#71717a", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Plan
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {PLAN_OPTIONS.map((p) => (
            <button
              key={p}
              onClick={() => handlePlanChange(p)}
              disabled={pending}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "1px solid",
                borderColor: plan === p ? "#6366f1" : "#3f3f46",
                background: plan === p ? "#1e1b4b" : "#09090b",
                color: plan === p ? "#a5b4fc" : "#71717a",
                fontWeight: plan === p ? 700 : 400,
                fontSize: 13, cursor: "pointer", textAlign: "left",
                textTransform: "capitalize", opacity: pending ? 0.6 : 1,
              }}
            >
              {p}
              {plan === p && <span style={{ float: "right", color: "#6366f1" }}>✓</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Suspend / Activate */}
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#71717a", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Estado
        </div>
        <button
          onClick={handleToggleSuspend}
          disabled={pending}
          style={{
            width: "100%", padding: "9px 14px", borderRadius: 8,
            border: `1px solid ${suspended ? "#166534" : "#7f1d1d"}`,
            background: suspended ? "#14251a" : "#3b1a1a",
            color: suspended ? "#4ade80" : "#f87171",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {suspended ? "✓ Reactivar organización" : "⊘ Suspender organización"}
        </button>
        {suspended && (
          <p style={{ fontSize: 11, color: "#71717a", margin: "8px 0 0" }}>
            Organización actualmente suspendida. Los usuarios no pueden iniciar sesión.
          </p>
        )}
      </div>

      {/* Features */}
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#71717a", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Features
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FEATURE_DEFINITIONS.map((f) => {
            const enabled = featureMap[f.key] === true
            return (
              <label
                key={f.key}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
                  padding: "8px 10px", borderRadius: 8,
                  background: enabled ? "#0d1f17" : "transparent",
                  border: `1px solid ${enabled ? "#166534" : "#27272a"}`,
                  transition: "all 0.15s",
                }}
              >
                <div style={{ position: "relative", flexShrink: 0, marginTop: 2 }}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={pending}
                    onChange={(e) => handleFeatureToggle(f.key, e.target.checked)}
                    style={{ opacity: 0, position: "absolute", width: 16, height: 16, cursor: "pointer" }}
                  />
                  <div style={{
                    width: 16, height: 16, borderRadius: 4,
                    background: enabled ? "#16a34a" : "#09090b",
                    border: `1px solid ${enabled ? "#16a34a" : "#3f3f46"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {enabled && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: enabled ? "#d1fae5" : "#a1a1aa" }}>
                    {f.label}
                  </div>
                  <div style={{ fontSize: 11, color: "#52525b", marginTop: 1 }}>
                    {f.description}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}

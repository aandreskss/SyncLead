// Pure functions — no DB access, no side effects, easily testable.
import type {
  CampaignMetricsRow,
  AccountMetricsData,
  LeadCampaignRow,
} from "./decision-repository"

// ─── Types ────────────────────────────────────────────────────────────────────

export type CampaignDecision =
  | "pause"
  | "scale"
  | "optimize"
  | "healthy"
  | "insufficient_data"

export type CampaignType = "leads" | "sales" | "traffic" | "awareness" | "engagement" | "unknown"

export interface CampaignDecisionResult {
  metaCampaignId: string
  name: string | null
  objective: string | null
  campaignType: CampaignType
  decision: CampaignDecision
  score: number
  signals: string[]
}

export interface Recommendation {
  id: string
  severity: "critical" | "warning" | "positive" | "info"
  icon: string
  title: string
  detail: string
  action: string
}

export interface AccountHealthResult {
  score: number
  grade: "A" | "B" | "C" | "D" | "F"
  label: string
  color: "green" | "amber" | "coral" | "blue"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getCampaignType(objective: string | null): CampaignType {
  if (!objective) return "unknown"
  const obj = objective.toUpperCase()
  if (obj === "OUTCOME_LEADS" || obj === "LEAD_GENERATION") return "leads"
  if (obj === "OUTCOME_SALES" || obj === "CONVERSIONS") return "sales"
  if (obj === "OUTCOME_TRAFFIC" || obj === "LINK_CLICKS") return "traffic"
  if (obj === "OUTCOME_AWARENESS" || obj === "BRAND_AWARENESS" || obj === "REACH") return "awareness"
  if (obj === "OUTCOME_ENGAGEMENT" || obj === "POST_ENGAGEMENT" || obj === "PAGE_LIKES") return "engagement"
  return "unknown"
}

export function getCampaignTypeLabel(type: CampaignType): string {
  switch (type) {
    case "leads": return "Leads"
    case "sales": return "Ventas"
    case "traffic": return "Tráfico"
    case "awareness": return "Alcance"
    case "engagement": return "Interacción"
    default: return "Desconocido"
  }
}

// ─── computeCampaignDecision ──────────────────────────────────────────────────

export function computeCampaignDecision(
  row: CampaignMetricsRow,
  avgCpl: number | null
): CampaignDecisionResult {
  const signals: string[] = []
  let decision: CampaignDecision
  const campaignType = getCampaignType(row.objective)

  // ── Score components (adapted by campaign type) ──
  let score = 0

  if (campaignType === "awareness") {
    // Awareness: score by CPM and reach (lower CPM = better)
    // CPM < 5 = excellent, < 10 = good, < 20 = ok
    let cpmScore = 0
    if (row.cpm > 0 && row.cpm < 5) cpmScore = 40
    else if (row.cpm < 10) cpmScore = 30
    else if (row.cpm < 20) cpmScore = 20
    else if (row.cpm < 30) cpmScore = 10

    let trendScore = 0
    if (row.spendDelta > 0 && row.ctrDelta >= 0) trendScore = 20
    else if (row.ctrDelta >= -0.2) trendScore = 10

    let activityScore = 0
    if (row.daysSinceActivity <= 3) activityScore = 10
    else if (row.daysSinceActivity <= 7) activityScore = 5

    // Bonus: CTR > 1% for awareness is great
    const ctrBonus = row.ctr >= 1 ? 30 : row.ctr >= 0.5 ? 15 : 0

    score = Math.min(100, cpmScore + ctrBonus + trendScore + activityScore)

  } else if (campaignType === "traffic" || campaignType === "engagement") {
    // Traffic/Engagement: score by CTR and CPC
    let ctrScore = 0
    if (row.ctr >= 3) ctrScore = 40
    else if (row.ctr >= 2) ctrScore = 35
    else if (row.ctr >= 1) ctrScore = 25
    else if (row.ctr >= 0.5) ctrScore = 10

    let trendScore = 0
    if (row.spendDelta > 0 && row.ctrDelta >= 0) trendScore = 20
    else if (row.ctrDelta >= -0.2) trendScore = 10

    let activityScore = 0
    if (row.daysSinceActivity <= 3) activityScore = 10
    else if (row.daysSinceActivity <= 7) activityScore = 5

    // Bonus for CPC < 0.5
    const cpcBonus = row.cpc > 0 && row.cpc < 0.5 ? 30 : row.cpc < 1 ? 20 : 0

    score = Math.min(100, ctrScore + cpcBonus + trendScore + activityScore)

  } else {
    // Leads / Sales / Unknown: full scoring including conversions and real sales
    let ctrScore = 0
    if (row.ctr >= 2) ctrScore = 40
    else if (row.ctr >= 1) ctrScore = 30
    else if (row.ctr >= 0.5) ctrScore = 15

    // Confirmed sales (strong signal) vs checkout starts (medium signal)
    const conversionScore =
      row.realSales > 0
        ? 30
        : row.conversionsCount > 0
        ? 15
        : 0

    let trendScore = 0
    if (row.spendDelta > 0 && row.ctrDelta >= 0) trendScore = 20
    else if (row.ctrDelta >= -0.2) trendScore = 10

    let activityScore = 0
    if (row.daysSinceActivity <= 3) activityScore = 10
    else if (row.daysSinceActivity <= 7) activityScore = 5

    score = Math.min(100, ctrScore + conversionScore + trendScore + activityScore)
  }

  // ── Decision rules (adapted by campaign type) ──
  if (row.spend < 5) {
    decision = "insufficient_data"
    signals.push("Gasto insuficiente para análisis")

  } else if (campaignType === "awareness" || campaignType === "traffic" || campaignType === "engagement") {
    // Awareness/Traffic/Engagement: don't judge on conversions/sales
    if (row.daysSinceActivity > 14 && row.spend > 20) {
      decision = "pause"
      signals.push(`Sin actividad por ${row.daysSinceActivity} días con $${row.spend.toFixed(2)} gastados`)
    } else if (campaignType === "traffic" && row.ctr < 0.3 && row.impressions > 5000) {
      decision = "optimize"
      signals.push(`CTR de ${row.ctr.toFixed(2)}% muy bajo para campaña de tráfico`)
    } else if (campaignType === "awareness" && row.cpm > 40 && row.impressions > 1000) {
      decision = "optimize"
      signals.push(`CPM de $${row.cpm.toFixed(2)} muy alto — revisar audiencias`)
    } else if (row.ctrDelta < -0.5 && row.impressions > 1000) {
      decision = "optimize"
      signals.push(`CTR cayó ${Math.abs(row.ctrDelta).toFixed(2)} puntos vs período anterior`)
    } else if (row.ctr >= 2 && row.spendDelta < 20 && campaignType === "traffic") {
      decision = "scale"
      signals.push(`CTR de ${row.ctr.toFixed(2)}% excelente — escalar`)
    } else {
      decision = "healthy"
      signals.push(`Campaña de ${getCampaignTypeLabel(campaignType).toLowerCase()} dentro de parámetros`)
    }

  } else {
    // Leads / Sales / Unknown: full decision logic
    if (
      (row.daysSinceActivity > 14 && row.spend > 20) ||
      (row.spend > 50 && row.conversionsCount === 0 && row.ctr < 0.3) ||
      (row.realSales === 0 && row.spend > 100) ||
      (avgCpl !== null && row.prevSpend > 0 && row.spend > avgCpl * 4)
    ) {
      decision = "pause"
      if (row.daysSinceActivity > 14 && row.spend > 20) {
        signals.push(`Sin actividad por ${row.daysSinceActivity} días con $${row.spend.toFixed(2)} gastados`)
      }
      if (row.spend > 50 && row.conversionsCount === 0 && row.ctr < 0.3) {
        signals.push("Alto gasto, 0 conversiones y CTR muy bajo")
      }
      if (row.realSales === 0 && row.spend > 100) {
        signals.push(`$${row.spend.toFixed(2)} gastados sin ninguna venta real confirmada`)
      }
      if (avgCpl !== null && row.prevSpend > 0 && row.spend > avgCpl * 4) {
        signals.push("CPL muy superior al promedio de la cuenta")
      }
    } else if (row.ctr > 1.5 && row.realSales > 0 && row.spendDelta < 20) {
      decision = "scale"
      signals.push(`CTR de ${row.ctr.toFixed(2)}% con ${row.realSales} venta${row.realSales > 1 ? "s" : ""} confirmada${row.realSales > 1 ? "s" : ""}`)
      signals.push("Margen para escalar presupuesto")
    } else if (
      (row.ctr < 0.5 && row.impressions > 5000) ||
      (row.ctrDelta < -0.5 && row.impressions > 1000) ||
      (row.conversionsCount > 0 && row.realSales === 0 && row.spend > 50)
    ) {
      decision = "optimize"
      if (row.ctr < 0.5 && row.impressions > 5000) {
        signals.push(`CTR de ${row.ctr.toFixed(2)}% con ${row.impressions.toLocaleString("es")} impresiones`)
      }
      if (row.ctrDelta < -0.5 && row.impressions > 1000) {
        signals.push(`CTR cayó ${Math.abs(row.ctrDelta).toFixed(2)} puntos vs período anterior`)
      }
      if (row.conversionsCount > 0 && row.realSales === 0 && row.spend > 50) {
        signals.push(`${row.conversionsCount} checkout${row.conversionsCount > 1 ? "s" : ""} iniciado${row.conversionsCount > 1 ? "s" : ""} sin ventas — los checkouts no cierran`)
      }
    } else {
      decision = "healthy"
      signals.push("Rendimiento dentro de parámetros normales")
    }
  }

  return { metaCampaignId: row.metaCampaignId, name: row.name, objective: row.objective, campaignType, decision, score, signals }
}

// ─── generateRecommendations ──────────────────────────────────────────────────

export function generateRecommendations(
  campaignDecisions: CampaignDecisionResult[],
  account: AccountMetricsData,
  rows: CampaignMetricsRow[],
  leadsData: LeadCampaignRow[]
): Recommendation[] {
  const recs: Recommendation[] = []
  const rowMap = new Map(rows.map((r) => [r.metaCampaignId, r]))

  // CRITICAL: campaigns that should be paused
  for (const d of campaignDecisions) {
    if (d.decision !== "pause") continue
    const row = rowMap.get(d.metaCampaignId)
    const name = d.name ?? d.metaCampaignId
    const detail =
      row && row.daysSinceActivity > 14
        ? `Sin actividad hace ${row.daysSinceActivity} días con $${row.spend.toFixed(2)} gastados`
        : `Alto gasto sin retorno visible ($${row?.spend.toFixed(2) ?? "0"})`
    recs.push({
      id: `pause-${d.metaCampaignId}`,
      severity: "critical",
      icon: "🛑",
      title: `Pausar "${name}"`,
      detail,
      action: "Pausar campaña",
    })
  }

  // WARNING: checkouts not converting to real sales (only for leads/sales campaigns)
  for (const row of rows) {
    const type = getCampaignType(row.objective)
    if ((type === "leads" || type === "sales" || type === "unknown") &&
        row.conversionsCount > 0 && row.realSales === 0 && row.spend > 50) {
      recs.push({
        id: `checkout-no-sale-${row.metaCampaignId}`,
        severity: "warning",
        icon: "⚠️",
        title: `Checkouts sin ventas en "${row.name ?? row.metaCampaignId}"`,
        detail: `${row.conversionsCount} checkout${row.conversionsCount > 1 ? "s" : ""} iniciado${row.conversionsCount > 1 ? "s" : ""} pero 0 ventas confirmadas — revisar checkout / página de gracias`,
        action: "Revisar checkout",
      })
    }
  }

  // WARNING: campaigns with very low CTR (adjusted by type)
  for (const row of rows) {
    const type = getCampaignType(row.objective)
    const ctrThreshold = type === "traffic" ? 0.5 : 0.3
    if (row.ctr < ctrThreshold && row.impressions > 1000) {
      recs.push({
        id: `low-ctr-${row.metaCampaignId}`,
        severity: "warning",
        icon: "⚠️",
        title: `Revisar creativos de "${row.name ?? row.metaCampaignId}"`,
        detail: `CTR de ${row.ctr.toFixed(2)}% bajo para campaña de ${getCampaignTypeLabel(type).toLowerCase()} con ${row.impressions.toLocaleString("es")} impresiones`,
        action: "Actualizar creativos",
      })
    }
  }

  // WARNING: awareness campaigns with very high CPM
  for (const row of rows) {
    if (getCampaignType(row.objective) === "awareness" && row.cpm > 40 && row.impressions > 500) {
      recs.push({
        id: `high-cpm-${row.metaCampaignId}`,
        severity: "warning",
        icon: "💰",
        title: `CPM alto en "${row.name ?? row.metaCampaignId}"`,
        detail: `CPM de $${row.cpm.toFixed(2)} para campaña de alcance — revisar audiencias o pujas`,
        action: "Revisar audiencias",
      })
    }
  }

  // WARNING: account CTR trending down > 20%
  if (rows.length > 0) {
    const totalCurImpr = rows.reduce((s, r) => s + r.impressions, 0)
    const totalCurClicks = rows.reduce((s, r) => s + r.clicks, 0)
    const totalPrevImpr = rows.reduce((s, r) => s + r.prevImpressions, 0)
    const totalPrevClicks = rows.reduce((s, r) => s + r.prevClicks, 0)
    const curCtr = totalCurImpr > 0 ? (totalCurClicks / totalCurImpr) * 100 : 0
    const prevCtr = totalPrevImpr > 0 ? (totalPrevClicks / totalPrevImpr) * 100 : 0
    if (prevCtr > 0 && (curCtr - prevCtr) / prevCtr < -0.2) {
      recs.push({
        id: "account-ctr-drop",
        severity: "warning",
        icon: "📉",
        title: "CTR de la cuenta bajando",
        detail: `CTR actual: ${curCtr.toFixed(2)}% vs ${prevCtr.toFixed(2)}% anterior (caída de ${Math.abs(((curCtr - prevCtr) / prevCtr) * 100).toFixed(0)}%)`,
        action: "Revisar segmentaciones",
      })
    }
  }

  // POSITIVE: campaigns to scale
  for (const d of campaignDecisions) {
    if (d.decision !== "scale") continue
    const row = rowMap.get(d.metaCampaignId)
    const type = d.campaignType
    const detail =
      type === "traffic"
        ? `CTR de ${row?.ctr.toFixed(2) ?? "?"}% con CPC de $${row?.cpc.toFixed(2) ?? "?"} — excelente para tráfico`
        : `ROAS positivo con CTR de ${row?.ctr.toFixed(2) ?? "?"}% — margen para crecer`
    recs.push({
      id: `scale-${d.metaCampaignId}`,
      severity: "positive",
      icon: "🚀",
      title: `Escalar "${d.name ?? d.metaCampaignId}"`,
      detail,
      action: "Aumentar presupuesto",
    })
  }

  // INFO: leads campaigns with 0 real sales but spend > 50 → check sales process
  for (const row of rows) {
    const type = getCampaignType(row.objective)
    if ((type === "leads" || type === "sales") && row.realSales === 0 && row.spend > 50 && row.conversionsCount === 0) {
      recs.push({
        id: `no-conversion-${row.metaCampaignId}`,
        severity: "info",
        icon: "🎯",
        title: `"${row.name ?? row.metaCampaignId}" no registra conversiones`,
        detail: `Campaña de ${getCampaignTypeLabel(type).toLowerCase()} con $${row.spend.toFixed(2)} gastados sin ningún checkout ni venta — verificar píxel o CAPI`,
        action: "Verificar tracking",
      })
    }
  }

  // INFO: projected spend acceleration
  if (
    account.daysElapsed > 0 &&
    account.projectedMonthSpend > account.currentMonthSpend * 1.2
  ) {
    recs.push({
      id: "spend-acceleration",
      severity: "info",
      icon: "💸",
      title: "Ritmo de gasto acelerado este mes",
      detail: `Proyección mensual: $${account.projectedMonthSpend.toFixed(2)} (actual: $${account.currentMonthSpend.toFixed(2)})`,
      action: "Revisar presupuesto",
    })
  }

  // INFO: lead campaigns with low qualified rate
  for (const lc of leadsData) {
    if (lc.totalLeads < 10) continue
    const qualRate = lc.totalLeads > 0 ? (lc.qualifiedLeads / lc.totalLeads) * 100 : 0
    if (qualRate < 20) {
      recs.push({
        id: `cold-leads-${lc.campaignId}`,
        severity: "info",
        icon: "❄️",
        title: `"${lc.campaignName}" trae muchos leads fríos`,
        detail: `Solo ${qualRate.toFixed(0)}% de leads calificados de ${lc.totalLeads} totales`,
        action: "Revisar segmentación",
      })
    }
  }

  // WARNING: ad fatigue (CTR dropping)
  for (const row of rows) {
    if (row.ctrDelta < -0.4 && row.impressions > 1000) {
      const alreadyHasLowCtr = recs.some((r) => r.id === `low-ctr-${row.metaCampaignId}`)
      if (!alreadyHasLowCtr) {
        recs.push({
          id: `fatigue-${row.metaCampaignId}`,
          severity: "warning",
          icon: "😴",
          title: `Posible fatiga de anuncio en "${row.name ?? row.metaCampaignId}"`,
          detail: `CTR cayó ${Math.abs(row.ctrDelta).toFixed(2)} puntos — considera nuevos creativos`,
          action: "Rotar creativos",
        })
      }
    }
  }

  // Sort: critical → warning → positive → info
  const severityOrder: Record<Recommendation["severity"], number> = {
    critical: 0,
    warning: 1,
    positive: 2,
    info: 3,
  }
  recs.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return recs
}

// ─── computeAccountHealth ─────────────────────────────────────────────────────

export function computeAccountHealth(
  _account: AccountMetricsData,
  campaigns: CampaignMetricsRow[]
): AccountHealthResult {
  if (campaigns.length === 0) {
    return { score: 0, grade: "F", label: "Sin datos", color: "coral" }
  }

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0)

  const scoreForCampaign = (c: CampaignMetricsRow): number => {
    const type = getCampaignType(c.objective)

    if (type === "awareness") {
      let cpmScore = 0
      if (c.cpm > 0 && c.cpm < 5) cpmScore = 40
      else if (c.cpm < 10) cpmScore = 30
      else if (c.cpm < 20) cpmScore = 20
      else if (c.cpm < 30) cpmScore = 10
      const ctrBonus = c.ctr >= 1 ? 30 : c.ctr >= 0.5 ? 15 : 0
      let trendScore = 0
      if (c.spendDelta > 0 && c.ctrDelta >= 0) trendScore = 20
      else if (c.ctrDelta >= -0.2) trendScore = 10
      let activityScore = 0
      if (c.daysSinceActivity <= 3) activityScore = 10
      else if (c.daysSinceActivity <= 7) activityScore = 5
      return Math.min(100, cpmScore + ctrBonus + trendScore + activityScore)
    }

    if (type === "traffic" || type === "engagement") {
      let ctrScore = 0
      if (c.ctr >= 3) ctrScore = 40
      else if (c.ctr >= 2) ctrScore = 35
      else if (c.ctr >= 1) ctrScore = 25
      else if (c.ctr >= 0.5) ctrScore = 10
      const cpcBonus = c.cpc > 0 && c.cpc < 0.5 ? 30 : c.cpc < 1 ? 20 : 0
      let trendScore = 0
      if (c.spendDelta > 0 && c.ctrDelta >= 0) trendScore = 20
      else if (c.ctrDelta >= -0.2) trendScore = 10
      let activityScore = 0
      if (c.daysSinceActivity <= 3) activityScore = 10
      else if (c.daysSinceActivity <= 7) activityScore = 5
      return Math.min(100, ctrScore + cpcBonus + trendScore + activityScore)
    }

    // Leads / Sales / Unknown
    let ctrScore = 0
    if (c.ctr >= 2) ctrScore = 40
    else if (c.ctr >= 1) ctrScore = 30
    else if (c.ctr >= 0.5) ctrScore = 15
    const convScore = c.realSales > 0 ? 30 : c.conversionsCount > 0 ? 15 : 0
    let trendScore = 0
    if (c.spendDelta > 0 && c.ctrDelta >= 0) trendScore = 20
    else if (c.ctrDelta >= -0.2) trendScore = 10
    let activityScore = 0
    if (c.daysSinceActivity <= 3) activityScore = 10
    else if (c.daysSinceActivity <= 7) activityScore = 5
    return Math.min(100, ctrScore + convScore + trendScore + activityScore)
  }

  let weightedScore = 0
  if (totalSpend > 0) {
    for (const c of campaigns) {
      if (c.spend <= 0) continue
      weightedScore += scoreForCampaign(c) * (c.spend / totalSpend)
    }
  } else {
    weightedScore = campaigns.reduce((s, c) => s + scoreForCampaign(c), 0) / campaigns.length
  }

  const score = Math.round(Math.min(100, Math.max(0, weightedScore)))

  if (score >= 80) return { score, grade: "A", label: "Excelente", color: "green" }
  if (score >= 60) return { score, grade: "B", label: "Buena", color: "blue" }
  if (score >= 40) return { score, grade: "C", label: "Regular", color: "amber" }
  if (score >= 20) return { score, grade: "D", label: "Deficiente", color: "coral" }
  return { score, grade: "F", label: "Crítica", color: "coral" }
}

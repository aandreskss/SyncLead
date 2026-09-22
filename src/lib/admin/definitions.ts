export const PLAN_OPTIONS = ["free", "starter", "pro", "enterprise"] as const
export type PlanOption = typeof PLAN_OPTIONS[number]

export const FEATURE_DEFINITIONS = [
  { key: "metaInsights", label: "Meta Ads Insights", description: "Sync diario de métricas de Meta Ads" },
  { key: "advancedAnalytics", label: "Analytics avanzados", description: "Embudos, cohortes y exportaciones" },
  { key: "unlimitedLeads", label: "Leads ilimitados", description: "Sin límite de leads por mes" },
  { key: "apiAccess", label: "API Modo B (servidor)", description: "Credenciales server-secret para integración" },
  { key: "customReports", label: "Reportes personalizados", description: "Reportes PDF por campaña" },
  { key: "teamManagement", label: "Gestión de equipo", description: "Roles y vendedores ilimitados" },
  { key: "whiteLabel", label: "White Label", description: "Logo y dominio propios" },
  { key: "prioritySupport", label: "Soporte prioritario", description: "Respuesta en menos de 4 horas" },
] as const

export type FeatureKey = typeof FEATURE_DEFINITIONS[number]["key"]

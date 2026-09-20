import type { Temperature } from "@/lib/db/schema"

export function normalizePhone(phone: string): string {
  let p = phone.replace(/[\s\-\(\)\+]/g, "")
  if (p.startsWith("0")) p = "58" + p.slice(1)
  return p
}

const MAJOR_CITIES = [
  "caracas",
  "maracaibo",
  "valencia",
  "barquisimeto",
  "maracay",
  "ciudad guayana",
  "maturin",
  "barcelona",
  "cumana",
  "san cristobal",
]

export function calculateTemperature(negocio: boolean, city: string): Temperature {
  const normalized = city?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim() ?? ""
  const isCapital = MAJOR_CITIES.some((c) => normalized.includes(c))
  if (negocio && isCapital) return "hot"
  if (negocio) return "warm"
  return "cold"
}

export function normalizeCity(city: string): string {
  return city?.trim() ?? ""
}

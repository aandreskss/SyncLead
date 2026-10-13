export function normalizePhone(phone: string): string {
  let p = phone.replace(/[\s\-\(\)\+]/g, "")
  if (p.startsWith("0")) p = "58" + p.slice(1)
  return p
}

export function normalizeCity(city: string): string {
  return city?.trim() ?? ""
}

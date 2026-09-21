export function fmt(n: number, decimals = 0) {
  return n.toLocaleString("es", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function fmtMoney(n: number) {
  return `$${fmt(n, 2)}`
}

export function fmtPct(n: number, decimals = 1) {
  return `${fmt(n, decimals)} %`
}

/** "2026-09-21" → "21 de septiembre" */
export function longDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "long" }).format(new Date(y, m - 1, d))
}

/** "2026-09-21" → "lunes, 21 sept" */
export function tipDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "short" }).format(new Date(y, m - 1, d))
}

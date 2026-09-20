export interface DateRange {
  from: Date
  to: Date
  prevFrom: Date
  prevTo: Date
  preset: string
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

function subDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - days)
  return d
}

const PRESET_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 }

export function parseDateRange(
  preset: string = "30d",
  customFrom?: string,
  customTo?: string
): DateRange {
  const now = new Date()
  let from: Date
  let to: Date

  if (preset === "custom" && customFrom && customTo) {
    from = startOfDay(new Date(customFrom))
    to = endOfDay(new Date(customTo))
  } else {
    const days = PRESET_DAYS[preset] ?? 30
    to = endOfDay(now)
    from = startOfDay(subDays(now, days - 1))
  }

  const spanMs = to.getTime() - from.getTime()
  const prevTo = new Date(from.getTime() - 1)
  const prevFrom = new Date(prevTo.getTime() - spanMs)

  return { from, to, prevFrom, prevTo, preset: preset === "custom" ? "custom" : preset }
}

export function formatRangeLabel(from: Date, to: Date): string {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(d)
  return `${fmt(from)} – ${fmt(to)}`
}

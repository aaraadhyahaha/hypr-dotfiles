// Calendar maths for the Calendar and Countdown widgets. Pure, so it can be unit tested.

const DAY = 86400000

// "YYYY-MM-DD" → a UTC day number; local dates compared this way ignore DST and time of day
function dayNumber(iso: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = Date.UTC(y, mo - 1, d)
  const back = new Date(t)
  // reject 2026-13-40 and friends, which Date.UTC would silently roll over
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null
  return t / DAY
}

const today = (now: Date) => Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY

export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export function daysUntil(target: string, now = new Date()): number | null {
  const t = dayNumber(target)
  return t === null ? null : t - today(now)
}

export function countdownLabel(days: number | null) {
  if (days === null) return "Pick a date"
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  if (days === -1) return "Yesterday"
  return days > 0 ? `${days} days to go` : `${-days} days ago`
}

// how far through the wait we are, from the day the countdown was set
export function progressBetween(from: string, to: string, now = new Date()) {
  const a = dayNumber(from)
  const b = dayNumber(to)
  if (a === null || b === null) return 0
  if (b <= a) return today(now) >= b ? 1 : 0
  return Math.max(0, Math.min(1, (today(now) - a) / (b - a)))
}

export type DayCell = { day: number; inMonth: boolean; iso: string }

// six Monday-first weeks around `month` (1-12), so the grid never changes height
export function monthGrid(year: number, month: number): DayCell[] {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const lead = (first.getUTCDay() + 6) % 7 // days shown from the previous month
  const out: DayCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(year, month - 1, 1 - lead + i))
    out.push({
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month - 1,
      iso: d.toISOString().slice(0, 10),
    })
  }
  return out
}

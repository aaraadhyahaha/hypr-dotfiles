// Notification presentation model. Pure (no GTK) so it can be unit tested.

const CRITICAL = 2
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// How long a toast stays up in ms; null = until dismissed.
export function toastTimeout(
  n: { expireTimeout: number; urgency: number },
  fallback = 5000,
): number | null {
  if (n.urgency === CRITICAL || n.expireTimeout === 0) return null
  return n.expireTimeout < 0 ? fallback : n.expireTimeout
}

// Compact age label: now, 5m, 3h, Mon, 12 Oct.
export function relTime(nowSec: number, timeSec: number): string {
  const age = nowSec - timeSec
  if (age < 60) return "now"
  if (age < 3600) return `${Math.floor(age / 60)}m`
  if (age < 86400) return `${Math.floor(age / 3600)}h`
  const d = new Date(timeSec * 1000)
  if (age < 7 * 86400) return DAYS[d.getDay()]
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

// Groups ordered by their newest notification, items newest first.
export function groupByApp<T extends { appName: string; time: number }>(
  list: T[],
): { app: string; items: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const n of [...list].sort((a, b) => b.time - a.time)) {
    const g = groups.get(n.appName)
    g ? g.push(n) : groups.set(n.appName, [n])
  }
  return [...groups].map(([app, items]) => ({ app, items }))
}

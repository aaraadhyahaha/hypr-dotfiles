// Countdown timers (launcher `timer 10m tea`). Pure (no GTK) so it can be unit tested;
// scheduling, persistence and notifications live in timer.ts.

export type Timer = { id: number; label: string; secs: number; endWall: number }

const pad = (n: number) => String(n).padStart(2, "0")

// "10 min", "1 h 30 min", "45 s", "2 min 5 s"
export function fmtSpan(secs: number): string {
  const s = Math.max(0, Math.round(secs))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const parts: string[] = []
  if (h) parts.push(`${h} h`)
  if (m) parts.push(`${m} min`)
  if (r || !parts.length) parts.push(`${r} s`)
  return parts.join(" ")
}

// time left as a clock: "4:05", "1:02:03"
export function fmtLeft(secs: number): string {
  const s = Math.max(0, Math.ceil(secs))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

// local wall-clock "14:32"
export function fmtClock(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// split into timers still counting and timers whose end has passed (soonest first)
export function splitDue(list: Timer[], now: number): { live: Timer[]; due: Timer[] } {
  const live: Timer[] = []
  const due: Timer[] = []
  for (const t of list) (t.endWall <= now ? due : live).push(t)
  const bySoonest = (a: Timer, b: Timer) => a.endWall - b.endWall
  return { live: live.sort(bySoonest), due: due.sort(bySoonest) }
}

// whatever was on disk -> well-formed timers (bad entries dropped)
export function sanitize(raw: unknown): Timer[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((t): Timer[] => {
    if (!t || typeof t !== "object") return []
    const { id, label, secs, endWall } = t as Record<string, unknown>
    if (!Number.isInteger(id) || typeof secs !== "number" || !(secs > 0) || typeof endWall !== "number" || !Number.isFinite(endWall)) return []
    return [{ id: id as number, label: typeof label === "string" ? label : "", secs, endWall }]
  })
}

// what a finished timer is called: "tea · 10 min", or just "10 min"
export function timerTitle(t: Pick<Timer, "label" | "secs">): string {
  return t.label ? `${t.label} · ${fmtSpan(t.secs)}` : fmtSpan(t.secs)
}

// Parsing `fx status --json` (the fx focus tracker, ~/Projects/fx). Pure, so it can be unit tested.

export type FxTask = { id: number; title: string; severity: number; effort: number; done: boolean; minutes: number }

export type FxStatus = {
  date: string
  checkedIn: boolean
  score: number
  completion: number
  focus: number
  focusMin: number
  targetMin: number
  idleMin: number
  window: [string, string]
  hourly: number[]
  streak: { days: number; status: "clean" | "bent" | "reset" }
  active: { taskId: number | null; title: string | null; since: string } | null
  tasks: FxTask[]
}

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d)
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d)

function task(t: any): FxTask | null {
  if (!t || !Number.isInteger(t.id) || typeof t.title !== "string") return null
  return {
    id: t.id,
    title: padTimes(t.title),
    severity: Math.max(1, Math.min(5, Math.round(num(t.severity, 1)))),
    effort: num(t.effort),
    done: t.done === true,
    minutes: num(t.minutes),
  }
}

// null: not fx status output (fx missing, crashed, or an older fx without `status`)
export function parseStatus(text: string): FxStatus | null {
  let j: any
  try {
    j = JSON.parse(text)
  } catch {
    return null
  }
  if (!j || typeof j.score !== "number" || !Array.isArray(j.tasks)) return null
  const status = j.streak?.status
  const a = j.active
  return {
    date: str(j.date),
    checkedIn: j.checked_in === true,
    score: j.score,
    completion: num(j.completion),
    focus: num(j.focus),
    focusMin: num(j.focus_min),
    targetMin: num(j.target_min, 240),
    idleMin: num(j.idle_min),
    window: [str(j.window?.[0], "09:00"), str(j.window?.[1], "22:00")],
    hourly: Array.isArray(j.hourly) ? j.hourly.map((v: unknown) => num(v)) : [],
    streak: {
      days: num(j.streak?.days),
      status: status === "bent" || status === "reset" ? status : "clean",
    },
    active: a && typeof a.since === "string"
      ? { taskId: Number.isInteger(a.task_id) ? a.task_id : null, title: typeof a.title === "string" ? padTimes(a.title) : null, since: a.since }
      : null,
    tasks: j.tasks.map(task).filter((t: FxTask | null): t is FxTask => t !== null),
  }
}

const pad = (n: number) => String(n).padStart(2, "0")

// "03:09" like fx's own report
export function hm(minutes: number) {
  const m = Math.floor(minutes)
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

// Task titles carry times like "Thu 4:00"; show them as "Thu 04:00"
export const padTimes = (s: string) => s.replace(/(?<![\d:])(\d):(\d\d)(?!\d)/g, "0$1:$2")

// fx stores naive local ISO times, which Date parses as local
export function sinceMinutes(iso: string, now = new Date()) {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now.getTime() - t) / 60000))
}

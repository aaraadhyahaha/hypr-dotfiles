// Asana "My Tasks" for the desktop's Asana Day widget: parsing API pages and picking a day's
// tasks. Pure, so it can be unit tested. The I/O lives in asana.ts.

import { isoDay } from "../widget/desktop/dates.ts"

export type AsanaTask = {
  gid: string
  name: string
  dueOn: string | null // "YYYY-MM-DD"
  dueAt: string | null // ISO timestamp, UTC
  completed: boolean
  url: string
  project: string | null
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function task(t: any): AsanaTask | null {
  if (!t || typeof t.gid !== "string" || typeof t.name !== "string") return null
  const dueAt = typeof t.due_at === "string" && !Number.isNaN(Date.parse(t.due_at)) ? t.due_at : null
  const dueOn = typeof t.due_on === "string" && ISO_DAY.test(t.due_on) ? t.due_on : null
  const p = Array.isArray(t.projects) ? t.projects.find((x: any) => typeof x?.name === "string") : null
  return {
    gid: t.gid,
    name: t.name.trim() || "Untitled task",
    dueOn,
    dueAt,
    completed: t.completed === true,
    url: typeof t.permalink_url === "string" ? t.permalink_url : `https://app.asana.com/0/0/${t.gid}`,
    project: p ? p.name : null,
  }
}

// one page of /user_task_lists/{gid}/tasks; null when the body isn't one
export function parseTasks(text: string): { tasks: AsanaTask[]; next: string | null } | null {
  let j: any
  try {
    j = JSON.parse(text)
  } catch {
    return null
  }
  if (!j || !Array.isArray(j.data)) return null
  const next = typeof j.next_page?.offset === "string" ? j.next_page.offset : null
  return { tasks: j.data.map(task).filter((t: AsanaTask | null): t is AsanaTask => t !== null), next }
}

// the local day a task is due on: a timed deadline counts on its local date, not its UTC one
export function localDay(t: AsanaTask): string | null {
  if (t.dueAt) return isoDay(new Date(t.dueAt))
  return t.dueOn
}

// tasks due on `iso`; today also gathers every open task that is overdue
export function tasksForDay(tasks: AsanaTask[], iso: string, todayIso: string): AsanaTask[] {
  const picked = tasks.filter((t) => {
    const d = localDay(t)
    if (!d) return false
    if (d === iso) return true
    return iso === todayIso && !t.completed && d < todayIso
  })
  const time = (t: AsanaTask) => (t.dueAt ? Date.parse(t.dueAt) : Infinity)
  return picked.sort(
    (a, b) =>
      Number(a.completed) - Number(b.completed) ||
      (localDay(a) ?? "").localeCompare(localDay(b) ?? "") || // overdue first
      time(a) - time(b) ||
      a.name.localeCompare(b.name),
  )
}

export const isOverdue = (t: AsanaTask, todayIso: string) => {
  const d = localDay(t)
  return !t.completed && d !== null && d < todayIso
}

// open tasks due on each day, for the dots on the week strip
export function countsByDay(tasks: AsanaTask[], week: string[]): number[] {
  return week.map((iso) => tasks.filter((t) => !t.completed && localDay(t) === iso).length)
}

const DAY = 86400000
const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10)

export const addDays = (iso: string, n: number) => fromUtc(utc(iso) + n * DAY)

// Monday of the week containing `iso`
export const mondayOf = (iso: string) => addDays(iso, -((new Date(utc(iso)).getUTCDay() + 6) % 7))

// the seven Monday-first days of the week containing `iso`
export const weekOf = (iso: string) => {
  const mon = mondayOf(iso)
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
}

export const shiftWeek = (iso: string, by: number) => addDays(iso, 7 * by)

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// "Today", "Tomorrow", "Yesterday", else "Thu 19 Nov"
export function dayLabel(iso: string, todayIso: string) {
  const diff = (utc(iso) - utc(todayIso)) / DAY
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  if (diff === -1) return "Yesterday"
  const d = new Date(utc(iso))
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`
}

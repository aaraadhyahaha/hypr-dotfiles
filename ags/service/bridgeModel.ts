// Hemingway bridges: one line left when stopping work, shown when coming back to it.
// Pure, so it can be unit tested; service/bridge.ts owns the state and the reactions.

import type { FxStatus } from "./fxModel"

export type Bridge = {
  taskId: number | null
  title: string
  text: string // line 1, stem included, exactly as written
  pickup: string // the optional half-finished line 2; "" when none
  at: string // ISO time it was written
  kind: "task" | "day"
  seen: boolean
}

const KEEP_MS = 3 * 24 * 3600 * 1000

// what line 1 of the pause sheet starts with; backspace can delete into it
export const STEM = { task: "Next, I ", day: "Tomorrow, first I " } as const

// line 1 as it's stored: trimmed, or "" when nothing was added to the stem (or what's left of it)
export function written(line: string, stem: string) {
  const t = line.trim()
  return stem.trim().startsWith(t) ? "" : t
}

// the task that just stopped being focused, unless it stopped because it was marked done, or it's
// the Shutdown task (that one already asked for tomorrow's question when it started)
export function stoppedTask(prev: FxStatus | null, next: FxStatus): { id: number; title: string } | null {
  const id = prev?.active?.taskId
  if (id == null || next.active?.taskId === id) return null
  const t = next.tasks.find((t) => t.id === id)
  if (t?.done) return null
  const title = t?.title ?? prev!.active!.title ?? ""
  return isShutdown(title) ? null : { id, title }
}

export const isShutdown = (title: string | null | undefined) => !!title && /\bshutdown\b/i.test(title)

// local "HH:MM" on now's day; null when it doesn't parse
function at(hhmm: string, now: Date): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const d = new Date(now)
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  return d
}

// fx target reached, or the focus window has closed
export function dayOver(s: FxStatus, now = new Date()) {
  if (s.targetMin > 0 && s.focusMin >= s.targetMin) return true
  const end = at(s.window[1], now)
  return !!end && now >= end
}

const pad = (n: number) => String(n).padStart(2, "0")

// local YYYY-MM-DD
export const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const time = (b: Bridge) => new Date(b.at).getTime()

// newest first; at most one note per task and one day note
export function put(list: Bridge[], b: Bridge): Bridge[] {
  const same = (x: Bridge) => (b.kind === "day" ? x.kind === "day" : x.kind === "task" && x.taskId === b.taskId)
  return [b, ...list.filter((x) => !same(x))]
}

export const noteFor = (list: Bridge[], taskId: number) =>
  list.find((b) => b.kind === "task" && b.taskId === taskId) ?? null

// last night's question: the unseen day note written before today
export function morningNote(list: Bridge[], today: string) {
  return list.find((b) => b.kind === "day" && !b.seen && dayOf(new Date(b.at)) < today) ?? null
}

const isActive = (s: FxStatus | null, id: number | null) => id !== null && s?.active?.taskId === id
const isDone = (s: FxStatus | null, id: number | null) => !!s?.tasks.find((t) => t.id === id)?.done

// the corner note: the newest task note or last night's day note, so a newer pause replaces an
// older one; hidden once seen, or while its task is active or done
export function shown(list: Bridge[], status: FxStatus | null, today: string) {
  const b = list.find((b) => b.kind === "task" || dayOf(new Date(b.at)) < today)
  if (!b || b.seen) return null
  return b.kind === "task" && (isActive(status, b.taskId) || isDone(status, b.taskId)) ? null : b
}

// marks a task's unseen notes seen when that task turns active or done; the same list when nothing changed
export function retire(list: Bridge[], prev: FxStatus | null, next: FxStatus) {
  const gone = (b: Bridge) =>
    b.kind === "task" &&
    !b.seen &&
    ((isActive(next, b.taskId) && !isActive(prev, b.taskId)) || (isDone(next, b.taskId) && !isDone(prev, b.taskId)))
  return list.some(gone) ? list.map((b) => (gone(b) ? { ...b, seen: true } : b)) : list
}

export const markSeenIn = (list: Bridge[], b: Bridge) => list.map((x) => (x === b ? { ...x, seen: true } : x))

export const prune = (list: Bridge[], now = new Date()) => list.filter((b) => now.getTime() - time(b) < KEEP_MS)

function bridge(v: any): Bridge | null {
  if (!v || typeof v.text !== "string" || !v.text.trim() || typeof v.at !== "string") return null
  if (Number.isNaN(new Date(v.at).getTime())) return null
  const kind = v.kind === "day" ? "day" : v.kind === "task" ? "task" : null
  const taskId = Number.isInteger(v.taskId) ? v.taskId : null
  if (!kind || (kind === "task" && taskId === null)) return null
  return {
    taskId,
    title: typeof v.title === "string" ? v.title : "",
    text: v.text,
    pickup: typeof v.pickup === "string" ? v.pickup : "",
    at: v.at,
    kind,
    seen: v.seen === true,
  }
}

// missing or corrupt: no notes
export function parseBridges(text: string): Bridge[] {
  let j: unknown
  try {
    j = JSON.parse(text)
  } catch {
    return []
  }
  if (!Array.isArray(j)) return []
  return j
    .map(bridge)
    .filter((b): b is Bridge => b !== null)
    .sort((a, b) => time(b) - time(a))
}

export const serialize = (list: Bridge[]) => JSON.stringify(list, null, 1)

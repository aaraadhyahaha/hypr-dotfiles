import GLib from "gi://GLib"
import { createState } from "ags"
import { execAsync } from "ags/process"
import { fxRun, fxStatus, openFx, useFx } from "./fx"
import type { FxStatus } from "./fxModel"
import {
  type Bridge,
  dayOf,
  dayOver,
  isShutdown,
  markSeenIn,
  noteFor,
  parseBridges,
  prune,
  put,
  serialize,
  stoppedTask,
} from "./bridgeModel"

// Hemingway bridges: stopping an fx task asks for the very next step, and focusing it again
// shows that step. Reacts only to fxStatus changes (svc.fx); no timers or processes of its own.
// Notes live in ~/.local/state/ags/bridges.json, saved debounced (file_set_contents is atomic).

const DIR = `${GLib.get_user_state_dir()}/ags`
const FILE = `${DIR}/bridges.json`
const SAVE_MS = 300
const BACK_MS = 12 * 3600 * 1000

// what the sheet (widget/bridge/BridgeSheet.tsx) should ask; null while it's closed
export type Prompt = { kind: "task" | "day"; taskId: number | null; title: string }

function load(): Bridge[] {
  try {
    const [ok, bytes] = GLib.file_get_contents(FILE)
    if (ok) return prune(parseBridges(new TextDecoder().decode(bytes)))
  } catch {
    // first run
  }
  return []
}

export const [bridges, setBridges] = createState<Bridge[]>(load())
export const [prompt, setPrompt] = createState<Prompt | null>(null)

let pending = 0

function commit(list: Bridge[]) {
  setBridges(list)
  if (pending) GLib.source_remove(pending)
  pending = GLib.timeout_add(GLib.PRIORITY_LOW, SAVE_MS, () => {
    pending = 0
    try {
      GLib.mkdir_with_parents(DIR, 0o755)
      GLib.file_set_contents(FILE, new TextEncoder().encode(serialize(bridges.get())))
    } catch (e) {
      console.error("bridge: save failed", e)
    }
    return GLib.SOURCE_REMOVE
  })
}

const toast = (summary: string, body: string) =>
  execAsync(["notify-send", "-a", "Bridge", summary, body]).catch(console.error)

// opens the sheet; a task prompt without an id falls back to the day question
export function leaveBridge(kind: "task" | "day", taskId: number | null = null, title = "") {
  setPrompt(kind === "task" && taskId !== null ? { kind, taskId, title } : { kind: "day", taskId: null, title: "" })
}

export const closePrompt = () => setPrompt(null)

// empty text: skipped, nothing stored
export function saveBridge(p: Prompt, text: string) {
  const t = text.trim()
  if (!t) return
  commit(put(prune(bridges.get()), { taskId: p.taskId, title: p.title, text: t, pickup: "", at: new Date().toISOString(), kind: p.kind, seen: false }))
}

export function markSeen(b: Bridge) {
  commit(markSeenIn(bridges.get(), b))
}

// back into the work: focus the note's task (a day note has none), then raise fx's terminal or start one
export function resumeBridge(b: Bridge) {
  if (b.taskId !== null) fxRun("focus", String(b.taskId))
  openFx()
}

// unlock (hypridle lock_cmd): the newest unseen note, if it's from the last 12h
export function bridgeBack() {
  const now = Date.now()
  const b = bridges.get().find((b) => !b.seen && now - new Date(b.at).getTime() < BACK_MS) // inlined until the unlock toast is retired
  if (b) toast(b.kind === "day" ? "Tomorrow's first question" : `Next on ${b.title}`, b.text)
}

let nudged = "" // the day the end-of-day nudge was shown

function nudge(today: string) {
  nudged = today
  // already left one today: nothing to ask
  if (bridges.get().some((b) => b.kind === "day" && dayOf(new Date(b.at)) === today)) return
  // --wait lives only while the toast is up; choosing the action prints its name
  execAsync(["notify-send", "-a", "Bridge", "-A", "bridge=Leave a bridge", "--wait", "Day's done", "Leave a question for tomorrow?"])
    .then((out) => {
      if (out.trim() === "bridge") leaveBridge("day")
    })
    .catch(console.error)
}

function react(prev: FxStatus | null, next: FxStatus) {
  const stopped = stoppedTask(prev, next)
  if (stopped) leaveBridge("task", stopped.id, stopped.title)

  const id = next.active?.taskId ?? null
  const started = prev !== null && id !== null && prev.active?.taskId !== id
  if (started && isShutdown(next.active?.title)) leaveBridge("day")
  else if (started) {
    const b = noteFor(bridges.get(), id)
    if (b) toast(`Next on ${b.title}`, b.text)
  }

  const today = dayOf(new Date())
  if (nudged !== today && dayOver(next)) nudge(today)
}

let started = false

// called once from app.ts
export function startBridge() {
  if (started) return
  started = true
  useFx()
  let prev = fxStatus.get()
  fxStatus.subscribe(() => {
    const next = fxStatus.get()
    if (next) react(prev, next)
    prev = next
  })
}

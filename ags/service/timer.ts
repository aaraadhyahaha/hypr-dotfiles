import GLib from "gi://GLib"
import { createState } from "ags"
import { interval } from "ags/time"
import { type Timer, splitDue, sanitize, timerTitle, fmtClock } from "./timerModel"

// Countdown timers started from the launcher (`timer 10m tea`). Each keeps its wall-clock
// end on disk, so it survives a restart and still fires after a suspend (a monotonic
// timeout would pause while the machine sleeps).

const DIR = `${GLib.get_user_data_dir()}/ags`
const FILE = `${DIR}/timers.json`
const SOUND = "/usr/share/sounds/freedesktop/stereo/complete.oga"

export const [timers, setTimers] = createState<Timer[]>([])

let tick: ReturnType<typeof interval> | null = null

function save(list: Timer[]) {
  try {
    GLib.mkdir_with_parents(DIR, 0o755)
    GLib.file_set_contents(FILE, new TextEncoder().encode(JSON.stringify(list)))
  } catch (e) {
    console.error("timer: save failed", e)
  }
}

function load(): Timer[] {
  try {
    const [ok, bytes] = GLib.file_get_contents(FILE)
    if (ok) return sanitize(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    // missing or corrupt: start empty
  }
  return []
}

function spawn(argv: string[]) {
  try {
    GLib.spawn_async(null, argv, null, GLib.SpawnFlags.SEARCH_PATH, null)
  } catch (e) {
    console.error("timer: spawn failed", e)
  }
}

// late: it ended while ags wasn't running
function ring(t: Timer, late: boolean) {
  const body = late ? `${timerTitle(t)} · ended ${fmtClock(t.endWall)}` : timerTitle(t)
  spawn(["notify-send", "-a", "Timer", "Timer done", body])
  if (!late) spawn(["paplay", SOUND])
}

function commit(list: Timer[]) {
  setTimers(list)
  save(list)
  // one shared 1 s poll, only while something is counting
  if (list.length && !tick) tick = interval(1000, check)
  else if (!list.length && tick) {
    tick.cancel()
    tick = null
  }
}

function check() {
  const { live, due } = splitDue(timers.get(), Date.now())
  if (!due.length) return
  due.forEach((t) => ring(t, false))
  commit(live)
}

export function addTimer(secs: number, label = ""): Timer {
  const list = timers.get()
  const id = list.reduce((m, t) => Math.max(m, t.id), 0) + 1
  const t: Timer = { id, label: label.trim(), secs, endWall: Date.now() + secs * 1000 }
  commit(splitDue([...list, t], Date.now()).live)
  return t
}

export function cancelTimer(id: number) {
  commit(timers.get().filter((t) => t.id !== id))
}

// called once at startup (app.ts): resume what was counting, report what ended meanwhile
export function restoreTimers() {
  const { live, due } = splitDue(load(), Date.now())
  due.forEach((t) => ring(t, true))
  commit(live)
}

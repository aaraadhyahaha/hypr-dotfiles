// Shell mood wiring (DESIGN.md › Mood). Feeds moodModel from Hyprland focus, the pomodoro,
// caffeine, critical notifications and the clock, and toggles the resulting classes on
// every app window. Bar popovers inherit them as CSS descendants of window.Bar.
import app from "ags/gtk4/app"
import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import AstalHyprland from "gi://AstalHyprland"
import AstalNotifd from "gi://AstalNotifd"
import { createState } from "ags"
import { pomodoro } from "./pomodoro"
import { awake } from "../widget/bar/modules/Caffeine"
import { MOTION } from "../widget/common/motion"
import {
  ALL_CLASSES,
  categorize,
  focusEnded,
  moodClasses,
  parseMode,
  type App,
  type Mode,
  type Pomo,
} from "./moodModel"

const DIR = `${GLib.get_user_state_dir()}/ags`
const FILE = `${DIR}/shell-mode`

function loadMode(): Mode {
  try {
    const [ok, bytes] = GLib.file_get_contents(FILE)
    if (ok) return parseMode(new TextDecoder().decode(bytes)) ?? "both"
  } catch {
    // first run: no file yet
  }
  return "both"
}

const [shellMode, setMode] = createState<Mode>(loadMode())
export { shellMode }

export function setShellMode(m: Mode) {
  setMode(m)
  try {
    GLib.mkdir_with_parents(DIR, 0o755)
    GLib.file_set_contents(FILE, new TextEncoder().encode(m))
  } catch (e) {
    console.error("mood: save failed", e)
  }
}

// AGS_MOOD_HOUR=19 previews a period; read once at start
const hourOverride = (() => {
  const v = Number.parseInt(GLib.getenv("AGS_MOOD_HOUR") ?? "", 10)
  return Number.isFinite(v) ? v : null
})()
const hour = () => hourOverride ?? new Date().getHours()

const snapshot = (): Pomo => ({ phase: pomodoro.state.phase, running: pomodoro.state.running })

let pomo: Pomo = snapshot()
let focusApp: App = categorize("", "")
let flash = false
let sweep = false
let applied: string[] = []

// add what's wanted, drop stale mood classes; leaves the window's own classes alone
function paint(w: Gtk.Window) {
  for (const c of ALL_CLASSES) if (!applied.includes(c) && w.has_css_class(c)) w.remove_css_class(c)
  for (const c of applied) if (!w.has_css_class(c)) w.add_css_class(c)
}

const watched = new WeakSet<Gtk.Window>()
function watch(w: Gtk.Window) {
  if (watched.has(w)) return
  watched.add(w)
  // a bound `class` (the bar's edit mode) replaces the whole list: put ours back
  w.connect("notify::css-classes", () => paint(w))
  paint(w)
}

function apply() {
  const next = moodClasses({
    mode: shellMode.get(),
    hour: hour(),
    pomo,
    app: focusApp,
    caffeine: awake.get(),
    flash,
    sweep,
  })
  if (next.join(" ") === applied.join(" ")) return
  applied = next
  for (const w of app.get_windows()) paint(w)
}

// one-shot flags (critical flash, focus-end sweep) that clear themselves after `ms`
function pulse(set: (on: boolean) => void, ms: number): () => void {
  let id = 0
  return () => {
    if (id) GLib.source_remove(id)
    set(false)
    apply() // drop the class first so a repeat restarts the CSS animation
    set(true)
    apply()
    id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
      id = 0
      set(false)
      apply()
      return GLib.SOURCE_REMOVE
    })
  }
}
const flashNow = pulse((on) => (flash = on), MOTION.flash)
const sweepNow = pulse((on) => (sweep = on), MOTION.sweep)

function followFocus(hypr: AstalHyprland.Hyprland) {
  let client: AstalHyprland.Client | null = null
  let ids: number[] = []
  const update = () => {
    focusApp = categorize(client?.class ?? "", client?.title ?? "")
    apply()
  }
  const refocus = () => {
    for (const id of ids) client?.disconnect(id)
    client = hypr.focusedClient
    ids = client
      ? [client.connect("notify::title", update), client.connect("notify::class", update)]
      : []
    update()
  }
  hypr.connect("notify::focused-client", refocus)
  refocus()
}

let started = false
export function startMood() {
  if (started) return
  started = true

  followFocus(AstalHyprland.get_default())

  pomodoro.subscribe(() => {
    const next = snapshot()
    const ended = focusEnded(pomo, next)
    pomo = next
    if (ended) sweepNow()
    else apply()
  })

  awake.subscribe(apply)
  shellMode.subscribe(apply)

  const notifd = AstalNotifd.get_default()
  notifd.connect("notified", (_, id) => {
    if (notifd.get_notification(id)?.urgency === AstalNotifd.Urgency.CRITICAL) flashNow()
  })

  // the period only changes on the hour; a minute tick is plenty
  GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 60, () => {
    apply()
    return GLib.SOURCE_CONTINUE
  })

  app.connect("window-added", (_, w) => watch(w))
  for (const w of app.get_windows()) watch(w)
  apply()
}

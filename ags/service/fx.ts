import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"
import Hyprland from "gi://AstalHyprland"
import { execAsync } from "ags/process"
import { parseStatus, type FxStatus } from "./fxModel"
import { hyprDispatch } from "./hypr"

// Today's fx data for the desktop widgets, from `fx status --json` (read-only: fx owns fx.db and
// its scoring). Refreshes when fx.db changes and once a minute, for the ticking focus minutes.

export type FxProblem = "missing" | "error" | null

const HOME = GLib.get_home_dir()
const LOCAL_FX = `${HOME}/.local/bin/fx`
const DB_DIR = `${HOME}/.local/share/fx`
const EVERY_S = 60
const SETTLE_MS = 400 // fx commits in bursts; wait for the last write

const [status, setStatus] = createState<FxStatus | null>(null)
const [problem, setProblem] = createState<FxProblem>(null)
export { status as fxStatus, problem as fxProblem }

const fxBin = () => (GLib.file_test(LOCAL_FX, GLib.FileTest.IS_EXECUTABLE) ? LOCAL_FX : "fx")

let running = false
let again = false

export function refreshFx() {
  if (running) {
    again = true
    return
  }
  running = true
  const bin = fxBin()
  execAsync([bin, "status", "--json"])
    .then((out) => {
      const s = parseStatus(out)
      // keep the last good data on a bad read; the widget shows it, not a blank card
      if (s) setStatus(s)
      setProblem(s ? null : "error")
    })
    .catch((e) => {
      const missing = bin === "fx" && /No such file|not found/i.test(String(e))
      setProblem(missing ? "missing" : "error")
      if (!missing) console.error("fx: status failed", e)
    })
    .finally(() => {
      running = false
      if (again) {
        again = false
        refreshFx()
      }
    })
}

let started = false
let monitor: Gio.FileMonitor | null = null

// call from any widget that shows fx data; the first call starts the refresh loop
export function useFx() {
  if (started) return
  started = true
  refreshFx()
  GLib.timeout_add_seconds(GLib.PRIORITY_LOW, EVERY_S, () => {
    refreshFx()
    return GLib.SOURCE_CONTINUE
  })
  try {
    GLib.mkdir_with_parents(DB_DIR, 0o755)
    monitor = Gio.File.new_for_path(DB_DIR).monitor_directory(Gio.FileMonitorFlags.NONE, null)
    monitor.set_rate_limit(SETTLE_MS)
    let pending = 0
    monitor.connect("changed", (_m, file) => {
      if (!file.get_basename()?.startsWith("fx.db")) return
      if (pending) GLib.source_remove(pending)
      pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SETTLE_MS, () => {
        pending = 0
        refreshFx()
        return GLib.SOURCE_REMOVE
      })
    })
  } catch (e) {
    console.error("fx: can't watch the database", e)
  }
}

// Runs an fx verb (`add`, `focus`, `stop`, `done`); fx makes every database write itself.
// Resolves to stdout, or null after reporting the failure as a notification, since the
// launcher that asked has already closed.
export function fxRun(...args: string[]): Promise<string | null> {
  return execAsync([fxBin(), ...args])
    .then((out) => {
      refreshFx()
      return out
    })
    .catch((e) => {
      // fx prints "fx: <reason>" on stderr; keep just the reason
      const reason = String(e).split("fx: ").pop()!.trim()
      execAsync(["notify-send", "-a", "fx", `fx ${args[0]} failed`, reason]).catch(console.error)
      return null
    })
}

const hypr = Hyprland.get_default()

// Focuses fx's kitty window if one is open, otherwise starts one
export function openFx() {
  const win = hypr.clients.find((c) => c.class === "fx" || (c.class === "kitty" && c.title === "fx"))
  if (win) {
    const a = win.address.startsWith("0x") ? win.address : `0x${win.address}`
    return hyprDispatch(`hl.dsp.focus({ window = "address:${a}" })`, ["focuswindow", `address:${a}`])
  }
  return execAsync(["setsid", "-f", "kitty", "--class", "fx", "--title", "fx", fxBin()]).catch(console.error)
}

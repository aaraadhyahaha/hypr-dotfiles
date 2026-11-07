import GLib from "gi://GLib"
import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import { execAsync } from "ags/process"
import { timeout } from "ags/time"
import { MOTION } from "../../common/motion"

// Control Center state shared by its parts and the bar pill.

// popover visibility: parts poll and refresh only while it is open
export const [open, setOpen] = createState(false)

let pop: Gtk.Popover | null = null
export const setPopover = (p: Gtk.Popover) => (pop = p)
export const closeCC = () => pop?.popdown()
export const toggleCC = () => (pop?.visible ? pop.popdown() : pop?.popup())

// refresh on open, but only once the open motion has played: spawning a process from this
// 250MB process blocks for ~3ms each, and four of them before the first frame cost ~12ms.
// Use it for state that rarely changes behind our back; read sysfs directly for the rest.
export const afterOpen = (fn: () => void) =>
  open.subscribe(() => open.get() && timeout(MOTION.enter, fn))

// a sysfs/procfs file, trimmed; null when it can't be read
export function readSys(path: string): string | null {
  try {
    const [ok, bytes] = GLib.file_get_contents(path)
    return ok ? new TextDecoder().decode(bytes).trim() : null
  } catch {
    return null
  }
}

// entries of a directory, sorted; [] when it doesn't exist
export function listDir(path: string): string[] {
  try {
    const dir = GLib.Dir.open(path, 0)
    const names: string[] = []
    for (let n = dir.read_name(); n !== null; n = dir.read_name()) names.push(n)
    dir.close()
    return names.sort()
  } catch {
    return []
  }
}

// the popover shows the Control Center or one of its panels (a chevron swaps them);
// closing always returns to the Control Center
export type Page = "cc" | "wifi" | "bt" | "audio"
export const [page, setPage] = createState<Page>("cc")

// shell out, resolving "" on failure: a missing tool shouldn't throw into the UI
// (execAsync throws synchronously when the binary doesn't exist)
export async function run(cmd: string | string[]) {
  try {
    return await execAsync(cmd)
  } catch (e) {
    console.error(`cc: ${e}`)
    return ""
  }
}

// night light: hyprsunset is ours to start and stop, so track it here and re-check on open
export const NIGHT_K = 4000
export const [nightOn, setNightOn] = createState(false)

export const checkNight = () =>
  run(["sh", "-c", "pgrep -x hyprsunset >/dev/null && echo 1 || echo 0"]).then((o) =>
    setNightOn(o.trim() === "1"),
  )

export function setNight(on: boolean) {
  setNightOn(on)
  run(["sh", "-c", on ? `setsid hyprsunset -t ${NIGHT_K} >/dev/null 2>&1 &` : "pkill -x hyprsunset"])
}

export const toggleNight = () => setNight(!nightOn.get())

checkNight()

// airplane = every radio soft-blocked (read from sysfs: cheap enough to run as the CC opens)
export const [planeOn, setPlaneOn] = createState(false)

export const checkPlane = () =>
  setPlaneOn(listDir("/sys/class/rfkill").every((d) => readSys(`/sys/class/rfkill/${d}/soft`) !== "0"))

export function setPlane(on: boolean) {
  setPlaneOn(on)
  run(["rfkill", on ? "block" : "unblock", "all"]).then(checkPlane)
}

checkPlane()

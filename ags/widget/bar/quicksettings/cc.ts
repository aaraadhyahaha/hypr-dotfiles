import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import { execAsync } from "ags/process"

// Control Center state shared by its parts and the bar pill.

// popover visibility: parts poll and refresh only while it is open
export const [open, setOpen] = createState(false)

let pop: Gtk.Popover | null = null
export const setPopover = (p: Gtk.Popover) => (pop = p)
export const closeCC = () => pop?.popdown()
export const toggleCC = () => (pop?.visible ? pop.popdown() : pop?.popup())

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

export function toggleNight() {
  const on = !nightOn.get()
  setNightOn(on)
  run(["sh", "-c", on ? `setsid hyprsunset -t ${NIGHT_K} >/dev/null 2>&1 &` : "pkill -x hyprsunset"])
}

checkNight()

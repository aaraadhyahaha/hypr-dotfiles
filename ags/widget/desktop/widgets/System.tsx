import { Gtk } from "ags/gtk4"
import { Accessor, onCleanup } from "ags"
import { cpu, ram, disk, temp } from "../../../service/system"
import Stat from "../../bar/quicksettings/Stat"
import { Ring, box, label } from "./common"
import type { WidgetProps } from "./types"

// CPU, memory, disk and temperature. S: four small rings. M: the Quick Settings sparklines.
// Readings run only while the desktop can be seen (`live`): the polls stop behind windows.

const pct = (v: number) => `${Math.round(v * 100)}%`
const deg = (v: number) => `${Math.round(v * 100)}°`

// a reading that only follows its source while the desktop is visible, so the poll stops
// behind windows (a poll runs only while something subscribes)
function whileLive(source: Accessor<number>, live: Accessor<boolean>) {
  let value = source.get()
  const subs = new Set<() => void>()
  let unsub: (() => void) | null = null
  const push = () => {
    value = source.get()
    for (const cb of subs) cb()
  }
  const sync = () => {
    if (live.get() && !unsub) {
      unsub = source.subscribe(push)
      push()
    } else if (!live.get() && unsub) {
      unsub()
      unsub = null
    }
  }
  onCleanup(live.subscribe(sync))
  onCleanup(() => unsub?.())
  sync()
  return new Accessor(
    () => value,
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
  )
}

function Mini(name: string, source: Accessor<number>, fmt: (v: number) => string, hot = 2) {
  const val = label(source.as(fmt), "dw-mini-val", { xalign: 0.5 })
  const ring = Ring({ size: 50, width: 5, frac: source, cls: "dw-sys-ring", center: [val] })
  const sync = () => {
    if (source.get() >= hot) ring.add_css_class("hot")
    else ring.remove_css_class("hot")
  }
  onCleanup(source.subscribe(sync))
  sync()
  return box("dw-mini", true, 3, [ring, label(name, "dw-mini-name", { xalign: 0.5 })], { halign: Gtk.Align.CENTER })
}

export default function System(p: WidgetProps) {
  const c = whileLive(cpu, p.live)
  const r = whileLive(ram, p.live)
  const d = whileLive(disk, p.live)
  const t = whileLive(temp, p.live)

  if (p.size === "s") {
    const g = new Gtk.Grid({ columnHomogeneous: true, rowHomogeneous: true, rowSpacing: 4, columnSpacing: 4, hexpand: true, vexpand: true })
    g.attach(Mini("CPU", c, pct, 0.85), 0, 0, 1, 1)
    g.attach(Mini("RAM", r, pct, 0.9), 1, 0, 1, 1)
    g.attach(Mini("DISK", d, pct, 0.9), 0, 1, 1, 1)
    g.attach(Mini("TEMP", t, deg, 0.85), 1, 1, 1, 1)
    return g
  }

  return box("dw-sys-m", true, 0, [
    box("", false, 0, [
      Stat({ label: "CPU", source: cpu, format: pct, active: p.live }),
      Stat({ label: "RAM", source: ram, format: pct, active: p.live }),
    ], { homogeneous: true }),
    box("", false, 0, [
      Stat({ label: "Disk", source: disk, format: pct, active: p.live }),
      Stat({ label: "Temp", source: temp, format: (v) => `${Math.round(v * 100)}°C`, active: p.live }),
    ], { homogeneous: true }),
  ], { hexpand: true, vexpand: true, homogeneous: true })
}

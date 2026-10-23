import GLib from "gi://GLib"
import { Gtk } from "ags/gtk4"
import { Accessor, createState, onCleanup } from "ags"
import { cpu, ram, temp } from "../../../service/system"
import { sparkHeights } from "../../../service/systemModel"
import { open } from "./cc"

const BARS = 12
const H = 18 // sparkline height, px
const SPAN = 0.1 // smallest range the bars stretch over (10 points)
const FLOOR = 0.2 // shortest bar, as a share of H

const memTotalGiB = (() => {
  try {
    const [, b] = GLib.file_get_contents("/proc/meminfo")
    const kb = Number(new TextDecoder().decode(b).match(/^MemTotal:\s+(\d+)/m)?.[1] ?? 0)
    return kb / 1024 ** 2
  } catch {
    return 0
  }
})()

// a reading and its last 12 samples as a row of bars; follows its poll only while the CC is open
function Stat({ name, source, format }: {
  name: string
  source: Accessor<number>
  format: (v: number) => string
}) {
  const [text, setText] = createState("--")
  const bars: Gtk.Widget[] = []
  let history: number[] | null = null

  const push = () => {
    const v = Math.min(1, Math.max(0, source.get()))
    history ??= new Array(BARS).fill(v) // first reading: a flat line at that value
    history.push(v)
    history.shift()
    sparkHeights(history, H, SPAN, FLOOR).forEach((h, i) => bars[i]?.set_size_request(-1, h))
    setText(format(v))
  }

  let unsub: (() => void) | null = null
  const sync = () => {
    if (open.get() && !unsub) {
      // an idle poll's get() is stale until it ticks, so only redraw what's already sampled
      unsub = source.subscribe(push)
      if (history) push()
    } else if (!open.get() && unsub) {
      unsub()
      unsub = null
    }
  }
  onCleanup(open.subscribe(sync))
  onCleanup(() => unsub?.())

  return (
    <box class="cc-card cc-stat" orientation={Gtk.Orientation.VERTICAL} hexpand spacing={6}>
      <label class="cc-stat-name" xalign={0} label={name} />
      <label class="cc-stat-val" xalign={0} label={text} />
      <box class="cc-spark" homogeneous spacing={2} heightRequest={H}>
        {Array.from({ length: BARS }, () => (
          <box class="cc-spark-bar" valign={Gtk.Align.END} $={(self) => bars.push(self)} />
        ))}
      </box>
    </box>
  )
}

export default function Stats() {
  return (
    <box class="cc-stats" homogeneous spacing={8}>
      <Stat name="CPU" source={cpu} format={(v) => `${Math.round(v * 100)}%`} />
      <Stat name="RAM" source={ram} format={(v) => `${(v * memTotalGiB).toFixed(1)} G`} />
      <Stat name="Temp" source={temp} format={(v) => `${Math.round(v * 100)}°`} />
    </box>
  )
}

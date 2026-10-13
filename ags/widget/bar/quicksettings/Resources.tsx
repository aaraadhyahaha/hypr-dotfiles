import { Gtk } from "ags/gtk4"
import { Accessor } from "ags"
import { createPoll } from "ags/time"
import Stat from "./Stat"

const pct = (v: number) => `${Math.round(v * 100)}%`
const deg = (v: number) => `${Math.round(v * 100)}°C`

export default function Resources({ active }: { active: Accessor<boolean> }) {
  let last = { total: 0, idle: 0 }

  const cpu = createPoll(0, 1000, ["head", "-n1", "/proc/stat"], (out) => {
    const n = out.trim().split(/\s+/).slice(1).map(Number)
    const idle = n[3] + (n[4] || 0)
    const total = n.slice(0, 8).reduce((a, b) => a + b, 0)
    const first = last.total === 0
    const dt = total - last.total
    const di = idle - last.idle
    last = { total, idle }
    return first || dt <= 0 ? 0 : 1 - di / dt
  })

  const ram = createPoll(
    0, 2000,
    ["sh", "-c", "free -b | awk '/Mem:/ {print ($2-$7)/$2}'"],
    (out) => Number(out) || 0,
  )

  const disk = createPoll(
    0, 30000,
    ["sh", "-c", "df --output=pcent / | tail -1 | tr -d ' %'"],
    (out) => (Number(out) || 0) / 100,
  )

  const temp = createPoll(
    0, 3000,
    ["sh", "-c", "cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | sort -n | tail -1"],
    (out) => (Number(out) || 0) / 100000,
  )

  return (
    <box class="qs-stats" orientation={Gtk.Orientation.VERTICAL}>
      <box homogeneous>
        <Stat label="CPU" source={cpu} format={pct} active={active} />
        <Stat label="RAM" source={ram} format={pct} active={active} />
      </box>
      <box homogeneous>
        <Stat label="Disk" source={disk} format={pct} active={active} />
        <Stat label="Temp" source={temp} format={deg} active={active} />
      </box>
    </box>
  )
}

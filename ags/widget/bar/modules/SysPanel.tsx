import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import { read, zones } from "../../../service/system"
import {
  cpuName,
  cpuSample,
  cpuUsage,
  fmtBytes,
  memUsage,
  procStat,
  sparkHeights,
  tempFraction,
  topProcs,
  type CpuSample,
  type Proc,
} from "../../../service/systemModel"
import Icon from "../../common/Icon"

const BARS = 32
const H = 36 // history height, px
const SPAN = 0.1
const FLOOR = 0.1
const GiB = 1024 ** 3

const model = cpuName(read("/proc/cpuinfo").match(/^model name\s*:\s*(.+)$/m)?.[1] ?? "")

const [cpuText, setCpuText] = createState("--")
const [mem, setMem] = createState({ frac: 0, text: "" })
const [temp, setTemp] = createState({ frac: 0, text: "" })
const [disk, setDisk] = createState({ frac: 0, text: "" })
const [procs, setProcs] = createState<Proc[]>([])
const [heights, setHeights] = createState<number[]>(new Array(BARS).fill(0))

const kb = (info: string, key: string) => Number(info.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"))?.[1] ?? 0)

function sampleMem() {
  const info = read("/proc/meminfo")
  const total = kb(info, "MemTotal") * 1024
  const used = total - kb(info, "MemAvailable") * 1024
  setMem({ frac: memUsage(info), text: `${(used / GiB).toFixed(1)} / ${Math.round(total / GiB)} GB` })
}

function sampleTemp() {
  const f = tempFraction(zones.map(read))
  setTemp({ frac: Math.min(1, f), text: `${Math.round(f * 100)} °C` })
}

function sampleDisk() {
  try {
    const info = Gio.File.new_for_path("/").query_filesystem_info("filesystem::size,filesystem::used", null)
    const size = info.get_attribute_uint64("filesystem::size")
    const used = info.get_attribute_uint64("filesystem::used")
    setDisk({ frac: size ? used / size : 0, text: `${Math.round(used / GiB)} / ${Math.round(size / GiB)} GB` })
  } catch {
    setDisk({ frac: 0, text: "" })
  }
}

let prevTicks = new Map<number, number>()
let prevProcTotal = 0
function sampleProcs(total: number) {
  const cur: Parameters<typeof topProcs>[1] = []
  try {
    const dir = GLib.Dir.open("/proc", 0)
    let n: string | null
    while ((n = dir.read_name())) {
      if (!/^\d+$/.test(n)) continue
      const p = procStat(read(`/proc/${n}/stat`))
      if (p) cur.push({ pid: Number(n), ...p })
    }
  } catch {}
  if (prevProcTotal) setProcs(topProcs(prevTicks, cur, total - prevProcTotal, 3))
  prevTicks = new Map(cur.map((p) => [p.pid, p.ticks]))
  prevProcTotal = total
}

// polls only while the popover is open: CPU every second, the rest every other tick
let source = 0
let tick = 0
let last: CpuSample = { total: 0, idle: 0 }
let history: number[] | null = null

function step() {
  const next = cpuSample(read("/proc/stat"))
  const v = Math.min(1, Math.max(0, cpuUsage(last, next)))
  const first = last.total === 0
  last = next
  if (!first) {
    history ??= new Array(BARS).fill(v) // first reading: a flat line at that value
    history.push(v)
    history.shift()
    setHeights(sparkHeights(history, H, SPAN, FLOOR))
    setCpuText(`${Math.round(v * 100)}%`)
  }
  if (tick % 2 === 0) {
    sampleMem()
    sampleTemp()
    sampleProcs(next.total)
  }
  if (tick % 30 === 0) sampleDisk()
  tick++
  return GLib.SOURCE_CONTINUE
}

export function start() {
  if (source) return
  tick = 0
  history = null
  step()
  source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, step)
}

export function stop() {
  if (source) GLib.source_remove(source)
  source = 0
}

function Meter({
  icon,
  name,
  kind,
  value,
}: {
  icon: string
  name: string
  kind: string
  value: typeof mem
}) {
  return (
    <box class="sys-card" orientation={Gtk.Orientation.VERTICAL} spacing={8}>
      <box spacing={8}>
        <Icon name={icon} class="sys-icon" />
        <label class="sys-name" hexpand xalign={0} label={name} />
        <label class="sys-val" label={value.as((v) => v.text)} />
      </box>
      <Gtk.ProgressBar
        class={value.as((v) => `sys-track ${kind}${kind === "disk" && v.frac > 0.9 ? " danger" : ""}`)}
        fraction={value.as((v) => v.frac)}
      />
    </box>
  )
}

// system stats popover (SysMini.tsx): CPU history · memory / temperature / disk · top processes
export default function SysPanel() {
  return (
    <box class="sys" orientation={Gtk.Orientation.VERTICAL} spacing={10}>
      <box class="sys-card" orientation={Gtk.Orientation.VERTICAL} spacing={8}>
        <box>
          <label class="sys-cpu" hexpand xalign={0} label={model ? `CPU · ${model}` : "CPU"} />
          <label class="sys-cpu-val" label={cpuText} />
        </box>
        <box class="sys-hist" homogeneous spacing={2} heightRequest={H}>
          {Array.from({ length: BARS }, (_, i) => (
            <box class="sys-bar" valign={Gtk.Align.END} heightRequest={heights.as((h) => h[i])} />
          ))}
        </box>
      </box>

      <Meter icon="memory_alt" name="Memory" kind="mem" value={mem} />
      <Meter icon="thermostat" name="Temperature" kind="temp" value={temp} />
      <Meter icon="hard_drive" name="Disk /" kind="disk" value={disk} />

      <box class="sys-procs" orientation={Gtk.Orientation.VERTICAL} spacing={8}>
        {[0, 1, 2].map((i) => (
          <box visible={procs.as((l) => i < l.length)}>
            <label hexpand xalign={0} label={procs.as((l) => l[i]?.name ?? "")} />
            <label
              class="sys-num"
              widthRequest={48}
              xalign={1}
              label={procs.as((l) => (l[i] ? `${(l[i].cpu * 100).toFixed(1)}%` : ""))}
            />
            <label
              class="sys-num"
              widthRequest={64}
              xalign={1}
              label={procs.as((l) => (l[i] ? fmtBytes(l[i].rss) : ""))}
            />
          </box>
        ))}
      </box>
    </box>
  )
}

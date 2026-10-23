import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createPoll } from "ags/time"
import { cpuSample, cpuUsage, memUsage, memUsedGb, tempFraction } from "./systemModel"

// Shared 0..1 readings for Quick Settings and the desktop System widget. Polls only run while
// something subscribes, and read /proc and /sys in-process instead of spawning a command.

export const read = (path: string) => {
  try {
    const [ok, bytes] = GLib.file_get_contents(path)
    return ok ? new TextDecoder().decode(bytes) : ""
  } catch {
    return ""
  }
}

let last = { total: 0, idle: 0 }
export const cpu = createPoll(0, 1000, () => {
  const next = cpuSample(read("/proc/stat"))
  const v = cpuUsage(last, next)
  last = next
  return v
})

export const ram = createPoll(0, 2000, () => memUsage(read("/proc/meminfo")))
export const ramGb = createPoll("0.0G", 2000, () => memUsedGb(read("/proc/meminfo")))

// used / (used + available), like df's Use%
export const disk = createPoll(0, 30000, () => {
  try {
    const info = Gio.File.new_for_path("/").query_filesystem_info("filesystem::used,filesystem::free", null)
    const used = info.get_attribute_uint64("filesystem::used")
    const free = info.get_attribute_uint64("filesystem::free")
    return used + free ? used / (used + free) : 0
  } catch {
    return 0
  }
})

export const zones = (() => {
  const out: string[] = []
  try {
    const d = GLib.Dir.open("/sys/class/thermal", 0)
    let n: string | null
    while ((n = d.read_name())) if (n.startsWith("thermal_zone")) out.push(`/sys/class/thermal/${n}/temp`)
  } catch {}
  return out
})()

export const temp = createPoll(0, 3000, () => tempFraction(zones.map(read)))

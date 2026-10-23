// Parsers for /proc and /sys readings. Pure, so they can be unit tested.

export type CpuSample = { total: number; idle: number }

// the aggregate "cpu" line of /proc/stat; idle includes iowait
export function cpuSample(stat: string): CpuSample {
  const n = (stat.split("\n")[0] ?? "").trim().split(/\s+/).slice(1).map(Number).filter(Number.isFinite)
  if (n.length < 4) return { total: 0, idle: 0 }
  return { total: n.slice(0, 8).reduce((a, b) => a + b, 0), idle: n[3] + (n[4] || 0) }
}

export function cpuUsage(prev: CpuSample, next: CpuSample) {
  const dt = next.total - prev.total
  if (prev.total === 0 || dt <= 0) return 0
  return 1 - (next.idle - prev.idle) / dt
}

export function memUsage(meminfo: string) {
  const kb = (key: string) => Number(meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"))?.[1] ?? 0)
  const total = kb("MemTotal")
  return total ? (total - kb("MemAvailable")) / total : 0
}

// "5.1G": used memory in GiB for the bar's mini readout
export function memUsedGb(meminfo: string) {
  const kb = (key: string) => Number(meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"))?.[1] ?? 0)
  return `${((kb("MemTotal") - kb("MemAvailable")) / 1048576).toFixed(1)}G`
}

// millidegrees from each thermal zone; 1 = 100°C
export function tempFraction(zones: string[]) {
  const t = zones.map((z) => Number(z.trim())).filter(Number.isFinite)
  return t.length ? Math.max(...t) / 100000 : 0
}

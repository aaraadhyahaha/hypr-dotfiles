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

const PAGE = 4096

export type ProcStat = { comm: string; ticks: number; rss: number }

// /proc/<pid>/stat: comm sits in parens and may hold either; utime + stime, rss in bytes
export function procStat(stat: string): ProcStat | null {
  const open = stat.indexOf("(")
  const close = stat.lastIndexOf(")")
  if (open < 0 || close < open) return null
  const f = stat.slice(close + 2).split(" ")
  const ticks = Number(f[11]) + Number(f[12])
  const rss = Number(f[21]) * PAGE
  if (!Number.isFinite(ticks) || !Number.isFinite(rss)) return null
  return { comm: stat.slice(open + 1, close), ticks, rss }
}

export type Proc = { name: string; cpu: number; rss: number }

// share of all CPU time (dTotal: /proc/stat's total delta) since `prev`, summed per name;
// pids born since the last sample have no delta yet and wait a round
export function topProcs(
  prev: Map<number, number>,
  cur: (ProcStat & { pid: number })[],
  dTotal: number,
  n: number,
): Proc[] {
  const by = new Map<string, Proc>()
  for (const p of cur) {
    const before = prev.get(p.pid)
    if (before === undefined) continue
    const e = by.get(p.comm) ?? { name: p.comm, cpu: 0, rss: 0 }
    e.cpu += dTotal > 0 ? Math.max(0, p.ticks - before) / dTotal : 0
    e.rss += p.rss
    by.set(p.comm, e)
  }
  return [...by.values()].sort((a, b) => b.cpu - a.cpu || b.rss - a.rss).slice(0, n)
}

// "210 M", "1.8 G"
export function fmtBytes(b: number) {
  const g = b / 1024 ** 3
  return g >= 1 ? `${g.toFixed(1)} G` : `${Math.round(b / 1024 ** 2)} M`
}

// "11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz" → "Core i5-1135G7"
export function cpuName(model: string) {
  return model
    .replace(/\((R|TM|tm)\)/g, "")
    .replace(/\s*(@|w\/|with ).*$/, "")
    .replace(/\b\d+(st|nd|rd|th) Gen\b|\b(AMD|Intel|CPU|Processor)\b|\b\d+-Core\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// bar heights for a sparkline: scaled to the window's own range (at least `span` wide, centred
// on a flat line) so steady load still reads as a shape; the label carries the absolute value
export function sparkHeights(history: number[], h: number, span: number, floor: number) {
  let lo = Math.min(...history)
  let hi = Math.max(...history)
  if (hi - lo < span) {
    const mid = (hi + lo) / 2
    lo = mid - span / 2
    hi = mid + span / 2
  }
  return history.map((v) => Math.round(h * (floor + (1 - floor) * ((v - lo) / (hi - lo)))))
}

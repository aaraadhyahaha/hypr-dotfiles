// Typed quick-action grammar for the launcher (timer, volume, power, fx, ...).
// Pure (no GTK) so it can be unit tested; side effects live in actions.ts.

const UNIT = String.raw`(\d+(?:\.\d+)?)`
const UNITS = new RegExp(
  `^(?:${UNIT}\\s*(?:h|hr|hrs|hours?))?(?:${UNIT}\\s*(?:m|min|mins|minutes?))?(?:${UNIT}\\s*(?:s|sec|secs|seconds?))?$`,
  "i",
)

// "10m", "1h30", "1h30m", "90s", "1.5h", "1:30" (h:mm), "1:30:15" (h:mm:ss), "10" (minutes)
// -> whole seconds, or null when it is not a positive duration
export function parseDuration(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  let secs: number | null = null
  let m: RegExpMatchArray | null
  if ((m = t.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/))) {
    secs = +m[1] * 3600 + +m[2] * 60 + +(m[3] ?? 0)
  } else if ((m = t.match(/^(\d+)\s*h(?:r|rs|ours?)?\s*(\d+)$/i))) {
    secs = +m[1] * 3600 + +m[2] * 60
  } else if (/^\d+(?:\.\d+)?$/.test(t)) {
    secs = +t * 60
  } else if ((m = t.match(UNITS))) {
    secs = +(m[1] ?? 0) * 3600 + +(m[2] ?? 0) * 60 + +(m[3] ?? 0)
  }
  if (secs === null) return null
  secs = Math.round(secs)
  return secs > 0 ? secs : null
}

export type ToggleTarget = "wifi" | "bt" | "dnd" | "nightlight" | "airplane" | "caffeine"
export type PowerOp = "lock" | "suspend" | "logout" | "reboot" | "shutdown"
export type MediaOp = "play" | "pause" | "next" | "prev"

export type Intent =
  | { kind: "timer"; secs: number; label: string }
  | { kind: "timers" }
  | { kind: "volume"; value: number; relative: boolean }
  | { kind: "brightness"; value: number; relative: boolean }
  | { kind: "mute"; target: "speaker" | "mic"; state?: boolean }
  | { kind: "toggle"; target: ToggleTarget; state?: boolean }
  | { kind: "theme"; mode: "dark" | "light" }
  | { kind: "power"; op: PowerOp }
  | { kind: "media"; op: MediaOp }
  | { kind: "screenshot" }
  | { kind: "record" }
  | { kind: "pomo"; op: "start" | "pause" | "toggle"; mins?: number; task?: string }

type Cmd = "timer" | "volume" | "brightness" | "mute" | "unmute" | "mic" | "theme" | "dark" | "light" | "pomo"
  | "screenshot" | "record" | "caffeine" | "night" | "airplane" | "wifi" | "bt" | "dnd"
  | PowerOp | MediaOp

// Order breaks prefix ties (first match wins). Prefixes need 3+ characters so
// ordinary app searches ("fi", "te") never turn into actions.
const COMMANDS: [string, Cmd][] = [
  ["timer", "timer"], ["volume", "volume"], ["brightness", "brightness"], ["mute", "mute"], ["unmute", "unmute"],
  ["mic", "mic"], ["theme", "theme"], ["dark", "dark"], ["light", "light"],
  ["pomo", "pomo"], ["pomodoro", "pomo"], ["focus", "pomo"],
  ["screenshot", "screenshot"], ["record", "record"], ["caffeine", "caffeine"], ["night", "night"],
  ["nightlight", "night"], ["airplane", "airplane"], ["wifi", "wifi"], ["bluetooth", "bt"], ["bt", "bt"],
  ["dnd", "dnd"], ["lock", "lock"], ["suspend", "suspend"], ["sleep", "suspend"], ["logout", "logout"],
  ["reboot", "reboot"], ["shutdown", "shutdown"], ["poweroff", "shutdown"],
  ["play", "play"], ["pause", "pause"], ["next", "next"], ["previous", "prev"], ["prev", "prev"],
]
const EXACT_ONLY = new Set(["bt", "dnd"])

function resolve(word: string): Cmd | null {
  const w = word.toLowerCase()
  const exact = COMMANDS.find(([n]) => n === w)
  if (exact) return exact[1]
  if (w.length < 3) return null
  return COMMANDS.find(([n]) => !EXACT_ONLY.has(n) && n.startsWith(w))?.[1] ?? null
}

function parseState(arg: string): boolean | undefined | null {
  const a = arg.toLowerCase()
  if (!a) return undefined
  if (["on", "enable", "true", "1"].includes(a)) return true
  if (["off", "disable", "false", "0"].includes(a)) return false
  return null
}

// "30" "30%" absolute; "+10" "-10" relative. Percentages are clamped.
function parseLevel(arg: string, min: number): { value: number; relative: boolean } | null {
  const m = arg.match(/^([+-]?)(\d+(?:\.\d+)?)%?$/)
  if (!m) return null
  const n = Math.round(+m[2])
  if (m[1]) return { value: m[1] === "-" ? -Math.min(n, 100) : Math.min(n, 100), relative: true }
  return { value: Math.max(min, Math.min(100, n)), relative: false }
}

export function parseAction(q: string): Intent | null {
  const words = q.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return null
  const cmd = resolve(words[0])
  if (!cmd) return null
  const rest = words.slice(1)
  const arg = rest.join(" ")

  switch (cmd) {
    case "timer": {
      if (!rest.length) return { kind: "timers" }
      // "5 min tea" / "1h 30m": the duration may span two words
      const glued = /[a-z]$/i.test(rest[0]) && /^\d/.test(rest[1] ?? "") ? parseDuration(rest[0] + rest[1]) : null
      const two = rest.length > 1 ? parseDuration(`${rest[0]} ${rest[1]}`) ?? glued : null
      if (two) return { kind: "timer", secs: two, label: rest.slice(2).join(" ") }
      const secs = parseDuration(rest[0])
      return secs ? { kind: "timer", secs, label: rest.slice(1).join(" ") } : null
    }
    case "volume":
    case "brightness": {
      const lv = rest.length === 1 ? parseLevel(rest[0], cmd === "volume" ? 0 : 1) : null
      return lv ? { kind: cmd, ...lv } : null
    }
    case "mute":
    case "unmute": {
      if (rest.length) return null
      return { kind: "mute", target: "speaker", state: cmd === "mute" }
    }
    case "mic": {
      const a = arg.toLowerCase()
      if (!a) return { kind: "mute", target: "mic" }
      if (a === "mute") return { kind: "mute", target: "mic", state: true }
      if (a === "unmute") return { kind: "mute", target: "mic", state: false }
      return null
    }
    case "theme":
      return rest.length === 1 && ["dark", "light"].includes(rest[0].toLowerCase())
        ? { kind: "theme", mode: rest[0].toLowerCase() as "dark" | "light" }
        : null
    case "dark":
    case "light":
      return rest.length ? null : { kind: "theme", mode: cmd }
    case "pomo": {
      const op = rest[0]?.toLowerCase()
      if (!op) return words[0].toLowerCase().startsWith("foc") ? { kind: "pomo", op: "start" } : { kind: "pomo", op: "toggle" }
      if (op === "pause" || op === "stop") return { kind: "pomo", op: "pause" }
      if (op === "start" || op === "toggle") return { kind: "pomo", op: op }
      const mins = /^\d+$/.test(rest[0]) ? +rest[0] : null
      if (!mins || mins > 600) return null
      const task = rest.slice(1).join(" ")
      return task ? { kind: "pomo", op: "start", mins, task } : { kind: "pomo", op: "start", mins }
    }
    case "night":
    case "airplane":
    case "wifi":
    case "bt":
    case "dnd":
    case "caffeine": {
      const target: ToggleTarget = cmd === "night" ? "nightlight" : cmd
      const args = cmd === "night" && rest[0]?.toLowerCase() === "light" ? rest.slice(1) : rest
      const state = parseState(args.join(" "))
      return state === null ? null : state === undefined ? { kind: "toggle", target } : { kind: "toggle", target, state }
    }
    case "screenshot":
    case "record":
      return rest.length ? null : { kind: cmd }
    case "lock":
    case "suspend":
    case "logout":
    case "reboot":
    case "shutdown":
      return rest.length ? null : { kind: "power", op: cmd }
    case "play":
    case "pause":
    case "next":
    case "prev":
      return rest.length ? null : { kind: "media", op: cmd }
  }
}

const DANGER_WORDS = new Set(["logout", "reboot", "shutdown", "poweroff"])

// "reb" resolves to reboot; ranked first, a quick Enter meant for an app would fire it.
// True when a session-ending action was reached by prefix rather than its full word.
export function riskyPrefix(q: string, intent: Intent): boolean {
  if (intent.kind !== "power" || intent.op === "lock" || intent.op === "suspend") return false
  return !DANGER_WORDS.has(q.trim().split(/\s+/)[0].toLowerCase())
}

export type FxQuery =
  | { kind: "list"; filter: string }
  | { kind: "add"; title: string; severity?: number; effort?: number }
  | { kind: "stop" }
  | { kind: "open" }

// `q` is what follows the fx prefix. "add Read ch 4 /3 45m": `/N` is severity
// (1-5), a unit-suffixed duration is effort in minutes; bare numbers stay in
// the title.
export function parseFxQuery(q: string): FxQuery {
  const t = q.trim()
  const lower = t.toLowerCase()
  if (lower === "stop") return { kind: "stop" }
  if (lower === "open") return { kind: "open" }
  const add = t.match(/^add(?:\s+(.*))?$/is)
  if (!add) return { kind: "list", filter: t }
  let severity: number | undefined
  let effort: number | undefined
  const title: string[] = []
  for (const w of (add[1] ?? "").split(/\s+/).filter(Boolean)) {
    const sev = w.match(/^\/([1-5])$/)
    if (sev && severity === undefined) severity = +sev[1]
    else if (effort === undefined && /[a-z]/i.test(w) && /^\d/.test(w) && parseDuration(w)) effort = Math.max(1, Math.round(parseDuration(w)! / 60))
    else title.push(w)
  }
  const out: FxQuery = { kind: "add", title: title.join(" ") }
  if (severity !== undefined) out.severity = severity
  if (effort !== undefined) out.effort = effort
  return out
}

// fx's own defaults for `fx add`, shown before Enter
export const FX_ADD_DEFAULTS = { severity: 3, effort: 30 }

// argv after the fx binary; `--` keeps a title like "-ish notes" from reading as a flag
export function fxAddArgs(q: { title: string; severity?: number; effort?: number }): string[] {
  const args = ["add"]
  if (q.severity !== undefined) args.push("--severity", String(q.severity))
  if (q.effort !== undefined) args.push("--effort", String(q.effort))
  return [...args, "--", q.title]
}

// Open tasks whose title holds every word of `filter` (any order, any case); the task in
// focus comes first, the rest keep fx's order (severity, highest first)
export function matchTasks<T extends { id: number; title: string; done: boolean }>(
  tasks: T[],
  filter: string,
  activeId: number | null = null,
): T[] {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean)
  const hits = tasks.filter((t) => !t.done && words.every((w) => t.title.toLowerCase().includes(w)))
  return [...hits.filter((t) => t.id === activeId), ...hits.filter((t) => t.id !== activeId)]
}

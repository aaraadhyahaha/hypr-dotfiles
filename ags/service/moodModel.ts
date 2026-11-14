// Shell mood: pure logic. Ambient (time of day) and reactive (pomodoro,
// focused app, caffeine, critical notifications) layers → CSS classes.

export type Mode = "ambient" | "both" | "reactive"
export type Period = "dawn" | "day" | "dusk" | "night"
export type Group = "build" | "write" | "browse" | "watch" | "system" | "unknown"

export const MODES: Mode[] = ["ambient", "both", "reactive"]

export interface Pomo {
  phase: "focus" | "short" | "long"
  running: boolean
}

export interface App {
  group: Group
  distraction: boolean
}

export interface MoodInput {
  mode: Mode
  hour: number
  pomo: Pomo | null
  app: App
  caffeine: boolean
  flash: boolean
  sweep: boolean
}

const BUILD = /^(kitty|dev\.zed\.zed|zed|code|code-oss|com\.microsoft\.vscode|t3code|claude)$/
const WRITE = /^(md\.obsidian\.obsidian|obsidian)$/
const BROWSER = /^(zen|zen-browser|google-chrome|chromium|chrome|firefox)$/
const PLAYER = /^(mpv)$/
const SYSTEM = /^(btop|org\.pulseaudio\.pavucontrol|pavucontrol|org\.gnome\.nautilus|nautilus|org\.gnome\.settings|gnome-control-center)$/

const MUSIC = /music\.youtube|youtube music|spotify|soundcloud/i
const WATCH = /youtube|netflix|twitch|reddit|instagram|x\.com|\/ x\b/i

export function categorize(cls: string, title: string): App {
  const c = (cls ?? "").toLowerCase()
  const t = title ?? ""
  if (PLAYER.test(c)) return { group: "watch", distraction: true }
  if (BROWSER.test(c)) {
    if (!MUSIC.test(t) && WATCH.test(t)) return { group: "watch", distraction: true }
    return { group: "browse", distraction: false }
  }
  if (BUILD.test(c)) return { group: "build", distraction: false }
  if (WRITE.test(c)) return { group: "write", distraction: false }
  if (SYSTEM.test(c)) return { group: "system", distraction: false }
  return { group: "unknown", distraction: false }
}

// dawn 5–9, day 9–17, dusk 17–20, night 20–5
export function period(hour: number): Period {
  const h = ((Math.floor(hour) % 24) + 24) % 24
  if (h >= 5 && h < 9) return "dawn"
  if (h >= 9 && h < 17) return "day"
  if (h >= 17 && h < 20) return "dusk"
  return "night"
}

type PomoKind = "focus" | "break" | null

export function pomoKind(p: Pomo | null): PomoKind {
  if (!p || !p.running) return null
  return p.phase === "focus" ? "focus" : "break"
}

// Focus just ended: previous state was focus, next is a break phase.
export function focusEnded(prev: Pomo | null, next: Pomo | null): boolean {
  return prev?.phase === "focus" && !!next && next.phase !== "focus"
}

export function nextMode(m: Mode): Mode {
  return MODES[(MODES.indexOf(m) + 1) % MODES.length]
}

export function parseMode(s: string | null | undefined): Mode | null {
  const v = (s ?? "").trim() as Mode
  return MODES.includes(v) ? v : null
}

const TINTED: Group[] = ["build", "write", "browse", "watch"]

export function moodClasses(i: MoodInput): string[] {
  const out: string[] = [`shell-${i.mode}`]
  const ambient = i.mode !== "reactive"
  const reactive = i.mode !== "ambient"

  if (ambient) out.push(`amb-${period(i.hour)}`)
  if (!reactive) return out

  const pk = pomoKind(i.pomo)
  if (pk) out.push(`mood-${pk}`)
  else if (TINTED.includes(i.app.group)) out.push(`mood-${i.app.group}`)

  // Bottom edge: critical flash outranks the nudge.
  if (i.flash) out.push("edge-critical")
  else if (pk === "focus" && i.app.distraction) out.push("edge-nudge")

  if (i.caffeine) out.push("edge-caffeine")
  if (i.sweep) out.push("sweep")
  return out
}

// Every class moodClasses can emit, so the service can remove stale ones.
export const ALL_CLASSES: string[] = [
  ...MODES.map((m) => `shell-${m}`),
  ...(["dawn", "day", "dusk", "night"] as Period[]).map((p) => `amb-${p}`),
  "mood-focus",
  "mood-break",
  ...TINTED.map((g) => `mood-${g}`),
  "edge-critical",
  "edge-nudge",
  "edge-caffeine",
  "sweep",
]

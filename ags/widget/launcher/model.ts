// Query parsing, calc detection, emoji search and frecency for the launcher.
// Pure (no GTK) so it can be unit tested.

// One result row. Built by Launcher.tsx and actions.ts.
export type Item = {
  // frecency id, e.g. app:firefox.desktop or emoji:🔥
  key?: string
  name: string
  description?: string | null
  iconName?: string | null
  // text shown in the tile instead of an icon
  glyph?: string
  // Material Symbols name shown in the tile instead of an icon
  symbol?: string
  // 0..1: a small level meter previewing the result (volume, brightness)
  level?: number
  // what Enter does, shown on the selected row ("Start", "Cancel"); bare ↵ when unset
  hint?: string
  // none = an informational row: Enter and click do nothing
  launch?: () => unknown
  // Shift+Enter, and its label next to the ↵ hint ("Done")
  alt?: () => unknown
  altHint?: string
  // Alt+Enter, and its label
  extra?: () => unknown
  extraHint?: string
}

export type Mode ="apps" | "calc" | "emoji" | "shell" | "web" | "fx"

const PREFIXES: Record<string, Mode> = { "=": "calc", ":": "emoji", ">": "shell", "?": "web", "!": "fx" }

export function parseQuery(text: string): { mode: Mode; q: string } {
  const t = text.trim()
  const mode = PREFIXES[t[0]]
  if (!mode && /^fx(\s|$)/i.test(t)) return { mode: "fx", q: t.slice(2).trim() }
  if (!mode) return { mode: "apps", q: t }
  return { mode, q: t.slice(1).trim() }
}

const MATH_WORDS = /\b(sqrt|cbrt|sin|cos|tan|asin|acos|atan|log|ln|exp|abs|floor|ceil|round|pi|e)\b/gi
const MATH_FUNC = /\b(sqrt|cbrt|sin|cos|tan|asin|acos|atan|log|ln|exp|abs|floor|ceil|round)\s*\(/i
const CONVERSION = /^\d[\d.,]*\s*[a-z°%$€£₹][a-z°%/²³]*\s+(to|in)\s+[a-z°%$€£₹][a-z°%/²³]*$/i

// Decides whether apps mode should also show a calc row. qalc turns plain
// words into nonsense units, so this must stay strict.
export function looksLikeMath(q: string): boolean {
  const t = q.trim()
  if (!t) return false
  if (CONVERSION.test(t)) return true
  const rest = t.replace(MATH_WORDS, "1")
  if (!/^[\s\d.,+\-*/^%()!]+$/.test(rest)) return false
  return MATH_FUNC.test(t) || /[\d)]\s*[+\-*/^%]\s*[\d(.\-]/.test(rest)
}

// qalc splits `5 km to mi` into `3 mi + 188 yd + ...`; a `-` before the target
// unit turns that off. "in" means inches to qalc, so it is rewritten to "to".
export function qalcExpr(q: string): string {
  const t = q.trim()
  const m = t.match(/^(\d[\d.,]*\s*[a-z°%$€£₹][a-z°%/²³]*)\s+(?:to|in)\s+([a-z°%$€£₹][a-z°%/²³]*)$/i)
  return m ? `${m[1]} to -${m[2]}` : t
}

// null = nothing worth showing (empty, an error, or just the input echoed back)
export function cleanCalc(input: string, output: string): string | null {
  const out = output.trim()
  if (!out || /^(error|warning)\b/i.test(out)) return null
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase()
  if (norm(out) === norm(input)) return null
  return out
}

export type Emoji = { glyph: string; name: string; keywords: string }

// One entry per line: glyph<TAB>name<TAB>keywords. Blank and "# " lines are
// skipped (a bare # is the keycap emoji's glyph).
export function parseEmojiData(tsv: string): Emoji[] {
  const out: Emoji[] = []
  for (const line of tsv.split("\n")) {
    if (!line.trim() || line.startsWith("# ")) continue
    const [glyph, name, keywords = ""] = line.split("\t")
    if (glyph && name) out.push({ glyph, name, keywords })
  }
  return out
}

// exact name, then name prefix, then word prefix, then keyword; stable within a tier
export function searchEmoji(list: Emoji[], q: string, max: number): Emoji[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return list.slice(0, max)
  const scored: { e: Emoji; tier: number }[] = []
  for (const e of list) {
    const name = e.name.toLowerCase()
    let tier = -1
    if (name === needle) tier = 0
    else if (name.startsWith(needle)) tier = 1
    else if (name.split(/[\s_-]+/).some((w) => w.startsWith(needle))) tier = 2
    else if (e.keywords.toLowerCase().includes(needle)) tier = 3
    if (tier >= 0) scored.push({ e, tier })
  }
  return scored
    .sort((a, b) => a.tier - b.tier)
    .slice(0, max)
    .map((s) => s.e)
}

export type Frecency = Record<string, { n: number; last: number }>

const HALF_LIFE_MS = 3 * 24 * 60 * 60 * 1000

export function bump(store: Frecency, key: string, now: number): Frecency {
  const prev = store[key]
  return { ...store, [key]: { n: (prev?.n ?? 0) + 1, last: now } }
}

export function frecencyScore(entry: { n: number; last: number } | undefined, now: number): number {
  if (!entry) return 0
  return entry.n * Math.pow(0.5, Math.max(0, now - entry.last) / HALF_LIFE_MS)
}

// Stable sort by frecency; ties keep the incoming order. Only the first
// `window` items are reordered, so fuzzy-match order still dominates.
export function rank<T>(
  items: T[],
  store: Frecency,
  now: number,
  keyOf: (item: T) => string,
  window = items.length,
): T[] {
  const head = items
    .slice(0, window)
    .map((item, i) => ({ item, i, s: frecencyScore(store[keyOf(item)], now) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item)
  return head.concat(items.slice(window))
}

export function webUrl(q: string): string {
  return "https://www.google.com/search?q=" + encodeURIComponent(q)
}

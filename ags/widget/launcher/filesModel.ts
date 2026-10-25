// Launcher files mode (`/`): recent-file matching and the preview pane's text.
// Pure (no GTK) so it can be unit tested.

export type Recent = { path: string; modified: number }

const basename = (p: string) => p.slice(p.replace(/\/+$/, "").lastIndexOf("/") + 1)

// 0 name prefix, 1 name substring, 2 name subsequence, 3 path substring; -1 no match
export function matchTier(path: string, q: string): number {
  const needle = q.trim().toLowerCase()
  if (!needle) return 0
  const name = basename(path).toLowerCase()
  if (name.startsWith(needle)) return 0
  if (name.includes(needle)) return 1
  let i = 0
  for (const ch of name) if (ch === needle[i]) i++
  if (i === needle.length) return 2
  if (path.toLowerCase().includes(needle)) return 3
  return -1
}

// newest first; with a query, better tiers first and newest within a tier
export function matchRecent(list: Recent[], q: string, max: number): Recent[] {
  return list
    .map((r) => ({ r, tier: matchTier(r.path, q) }))
    .filter((x) => x.tier >= 0)
    .sort((a, b) => a.tier - b.tier || b.r.modified - a.r.modified)
    .slice(0, max)
    .map((x) => x.r)
}

// recent hits first, then the index's, each path once
export function mergePaths(recent: string[], indexed: string[], max: number): string[] {
  return [...new Set([...recent, ...indexed])].slice(0, max)
}

export type PreviewKind = "dir" | "image" | "text" | "other"

// `isA` is Gio.content_type_is_a, passed in so this stays pure
export function previewKind(contentType: string, isDir: boolean, isA: (ct: string, parent: string) => boolean): PreviewKind {
  if (isDir) return "dir"
  if (contentType.startsWith("image/")) return "image"
  if (isA(contentType, "text/plain")) return "text"
  return "other"
}

// a NUL in the first chunk means it isn't text, whatever its name says
export function looksBinary(bytes: Uint8Array): boolean {
  return bytes.includes(0)
}

// the first `n` lines, tabs as two spaces, and no half character at a chunk boundary
export function firstLines(text: string, n: number): string {
  return text.replace(/�+$/, "").split(/\r?\n/).slice(0, n).join("\n").replace(/\t/g, "  ").trimEnd()
}

const UNITS = ["B", "KB", "MB", "GB", "TB"]

export function formatSize(bytes: number): string {
  let v = bytes
  let u = 0
  while (v >= 1000 && u < UNITS.length - 1) {
    v /= 1000
    u++
  }
  return u === 0 ? `${v} B` : `${v < 10 ? v.toFixed(1) : Math.round(v)} ${UNITS[u]}`
}

// "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the date
export function relTime(ms: number, now: number): string {
  const s = Math.max(0, (now - ms) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const days = Math.floor(s / 86400)
  if (days === 1) return "yesterday"
  if (days < 7) return `${days} days ago`
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

// `capped`: the listing stopped early, so the real count is higher
export function itemCount(n: number, capped: boolean): string {
  if (capped) return `${n}+ items`
  return n === 1 ? "1 item" : `${n} items`
}

export function tildePath(path: string, home: string): string {
  return path === home || path.startsWith(home + "/") ? "~" + path.slice(home.length) : path
}

// the largest size inside (w, h) that keeps the aspect ratio, never scaled up
export function fitSize(iw: number, ih: number, w: number, h: number): [number, number] {
  const s = Math.min(1, w / iw, h / ih)
  return [Math.max(1, Math.round(iw * s)), Math.max(1, Math.round(ih * s))]
}

// Screenshot toolbar helpers. Pure (no GTK) so they can be unit tested.

export const TIMERS = [0, 3, 5, 10]

export const nextTimer = (s: number): number => TIMERS[(TIMERS.indexOf(s) + 1) % TIMERS.length]

export const timerLabel = (s: number): string => (s ? `${s}s` : "Off")

// recording frame rates; 0 = wf-recorder's default (a frame per screen update, variable rate)
export const FPS = [0, 15, 24, 30, 60]

export const nextFps = (f: number): number => FPS[(FPS.indexOf(f) + 1) % FPS.length]

export const fpsLabel = (f: number): string => (f ? `${f} fps` : "Auto")

// `hyprctl activewindow -j` → "x,y wxh" for grim / wf-recorder; null without a window
export function windowGeometry(json: string): string | null {
  try {
    const { at, size } = JSON.parse(json)
    if (!Array.isArray(at) || !Array.isArray(size)) return null
    return `${at[0]},${at[1]} ${size[0]}x${size[1]}`
  } catch {
    return null
  }
}

// --- the screenshot session's selection (Screenshot.tsx), in overlay-local pixels

export type Mode = "region" | "window" | "screen"
export type Rect = { x: number; y: number; w: number; h: number }
export type Hit = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move" | "new"

export const CURSOR: Record<Hit, string> = {
  nw: "nw-resize", n: "n-resize", ne: "ne-resize", e: "e-resize",
  se: "se-resize", s: "s-resize", sw: "sw-resize", w: "w-resize",
  move: "move", new: "crosshair",
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

// a centred rectangle half the size of bounds
export const defaultRect = (b: Rect): Rect => ({
  x: Math.round(b.x + b.w / 4), y: Math.round(b.y + b.h / 4),
  w: Math.round(b.w / 2), h: Math.round(b.h / 2),
})

// what a press at (px, py) grabs: a handle (within `grab` of an edge), the inside, or nothing
export function hitTest(r: Rect, px: number, py: number, grab = 12): Hit {
  const inX = px >= r.x - grab && px <= r.x + r.w + grab
  const inY = py >= r.y - grab && py <= r.y + r.h + grab
  if (inX && inY) {
    // on a tiny rect both edges are in reach: the nearer one wins
    const dl = Math.abs(px - r.x), dr = Math.abs(px - r.x - r.w)
    const dt = Math.abs(py - r.y), db = Math.abs(py - r.y - r.h)
    const h = dl <= grab || dr <= grab ? (dl <= dr ? "w" : "e") : ""
    const v = dt <= grab || db <= grab ? (dt <= db ? "n" : "s") : ""
    if (h || v) return (v + h) as Hit
  }
  if (px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h) return "move"
  return "new"
}

// `start` dragged by (dx, dy) from the press point `from`; always normalised and inside bounds
export function dragRect(start: Rect, hit: Hit, from: [number, number], dx: number, dy: number, b: Rect): Rect {
  const bx = b.x + b.w, by = b.y + b.h
  if (hit === "move") return {
    ...start,
    x: clamp(start.x + dx, b.x, bx - start.w),
    y: clamp(start.y + dy, b.y, by - start.h),
  }

  // "new" spans from the press point; a handle moves the edges it names
  const edges = hit === "new" ? "se" : hit
  let l = start.x, t = start.y, r = start.x + start.w, btm = start.y + start.h
  if (hit === "new") {
    l = r = from[0]
    t = btm = from[1]
  }
  if (edges.includes("w")) l += dx
  if (edges.includes("e")) r += dx
  if (edges.includes("n")) t += dy
  if (edges.includes("s")) btm += dy
  l = clamp(l, b.x, bx)
  r = clamp(r, b.x, bx)
  t = clamp(t, b.y, by)
  btm = clamp(btm, b.y, by)
  // flip-through: dragging an edge past its opposite just swaps them
  return { x: Math.min(l, r), y: Math.min(t, btm), w: Math.abs(r - l), h: Math.abs(btm - t) }
}

// grim's "x,y wxh" for a local rect on an output at `origin`
export const geometry = (r: Rect, origin: { x: number; y: number }) =>
  `${Math.round(r.x + origin.x)},${Math.round(r.y + origin.y)} ${Math.round(r.w)}x${Math.round(r.h)}`

// the fields of `hyprctl monitors -j` that physicalCrop reads: x/y are logical, width/height
// are the mode's physical pixels (before the transform)
export type Output = {
  name: string
  x: number
  y: number
  width: number
  height: number
  scale: number
  transform?: number
}

export type Crop = { output: string; scale: number; x: number; y: number; w: number; h: number }

// A logical "x,y wxh" → the physical pixels to cut from one output's native-scale capture.
// grim -g on a fractional scale resamples whenever an edge lands between physical pixels
// (at 1.2, any x not a multiple of 5), which blurs the whole shot; cropping a 1:1 capture
// keeps every pixel. null when it's unparseable, empty, or spans outputs (caller falls back).
export function physicalCrop(geom: string, outputs: Output[]): Crop | null {
  const m = /^(-?\d+),(-?\d+) (\d+)x(\d+)$/.exec(geom.trim())
  if (!m) return null
  const [gx, gy, gw, gh] = m.slice(1).map(Number)
  if (gw <= 0 || gh <= 0) return null
  for (const o of outputs) {
    const rotated = (o.transform ?? 0) % 2 === 1
    const pw = rotated ? o.height : o.width
    const ph = rotated ? o.width : o.height
    const lw = pw / o.scale
    const lh = ph / o.scale
    if (gx < o.x || gy < o.y || gx + gw > o.x + lw + 0.5 || gy + gh > o.y + lh + 0.5) continue
    // round each edge, not the size, so neighbouring shots tile exactly
    const px = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v * o.scale)))
    const l = px(gx - o.x, pw)
    const t = px(gy - o.y, ph)
    const r = px(gx + gw - o.x, pw)
    const b = px(gy + gh - o.y, ph)
    if (r <= l || b <= t) return null
    return { output: o.name, scale: o.scale, x: l, y: t, w: r - l, h: b - t }
  }
  return null
}

// the fields of `hyprctl clients -j` that windowAt reads
export type Client = {
  at: [number, number]
  size: [number, number]
  workspace: { id: number }
  floating?: boolean
  pinned?: boolean
  hidden?: boolean
  mapped?: boolean
  focusHistoryID?: number
}

// the topmost visible client under the global point (x, y): floating above tiled, then most
// recently focused. `workspaceIds` are the shown workspaces (`hyprctl monitors -j`).
export function windowAt(clients: Client[], workspaceIds: number[], x: number, y: number): Client | null {
  const under = clients.filter((c) =>
    c.mapped !== false && !c.hidden &&
    (c.pinned || workspaceIds.includes(c.workspace?.id)) &&
    x >= c.at[0] && x < c.at[0] + c.size[0] && y >= c.at[1] && y < c.at[1] + c.size[1])
  under.sort((a, b) =>
    Number(!!b.floating) - Number(!!a.floating) ||
    (a.focusHistoryID ?? Infinity) - (b.focusHistoryID ?? Infinity))
  return under[0] ?? null
}

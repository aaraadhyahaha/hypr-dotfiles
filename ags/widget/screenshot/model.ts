// Screenshot toolbar helpers. Pure (no GTK) so they can be unit tested.

export const TIMERS = [0, 3, 5, 10]

export const nextTimer = (s: number): number => TIMERS[(TIMERS.indexOf(s) + 1) % TIMERS.length]

export const timerLabel = (s: number): string => (s ? `${s}s` : "Off")

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

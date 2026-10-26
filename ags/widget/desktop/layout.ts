// Desktop widget grid: sizes, snapping, placement and the saved-layout format.
// Pure (no GTK) so it can be unit tested.

export type Size = "s" | "m" | "l" | "xl"

export type Item = {
  id: string
  kind: string
  size: Size
  col: number
  row: number
  config: Record<string, unknown>
}

// px, py: the pitch (cell + gap) on each axis, stretched so the grid meets every edge
export type Grid = { cols: number; rows: number; px: number; py: number }
export type Cell = { col: number; row: number }
export type Slot = Cell & { size: Size }

export const CELL = 72
export const GAP = 12
export const MARGIN = 24
export const PITCH = CELL + GAP

export const SIZES: Size[] = ["s", "m", "l", "xl"]
export const SPANS: Record<Size, { w: number; h: number }> = {
  s: { w: 2, h: 2 },
  m: { w: 4, h: 2 },
  l: { w: 4, h: 4 },
  xl: { w: 8, h: 4 },
}

const VERSION = 1

// as many whole cells as fit, then widened to share out the remainder: no dead strip on the
// right or bottom
export function gridFor(width: number, height: number): Grid {
  const span = (px: number) => px - 2 * MARGIN + GAP
  const n = (px: number) => Math.max(1, Math.floor(span(px) / PITCH))
  const cols = n(width)
  const rows = n(height)
  return { cols, rows, px: Math.max(PITCH, span(width) / cols), py: Math.max(PITCH, span(height) / rows) }
}

// unstretched cells: the gallery's miniatures, and the grid until the surface is measured
export const NOMINAL: Grid = { ...gridFor(1536, 816), px: PITCH, py: PITCH }

export function sizePx(size: Size, grid: Grid = NOMINAL) {
  const s = SPANS[size]
  return { w: Math.round(s.w * grid.px - GAP), h: Math.round(s.h * grid.py - GAP) }
}

export const cellToPx = (grid: Grid, col: number, row: number) => ({
  x: Math.round(MARGIN + col * grid.px),
  y: Math.round(MARGIN + row * grid.py),
})

export const pxToCell = (grid: Grid, x: number, y: number): Cell => ({
  col: Math.round((x - MARGIN) / grid.px),
  row: Math.round((y - MARGIN) / grid.py),
})

function overlaps(a: Slot, b: Slot) {
  const sa = SPANS[a.size]
  const sb = SPANS[b.size]
  return a.col < b.col + sb.w && b.col < a.col + sa.w && a.row < b.row + sb.h && b.row < a.row + sa.h
}

// inside the grid and clear of every widget except `ignore` (the one being moved)
export function fits(items: Item[], slot: Slot, grid: Grid, ignore?: string | null) {
  const s = SPANS[slot.size]
  if (slot.col < 0 || slot.row < 0 || slot.col + s.w > grid.cols || slot.row + s.h > grid.rows) return false
  return items.every((it) => it.id === ignore || !overlaps(it, slot))
}

// the free cell closest to `target`; ties go to the upper, then the left spot
export function nearestFree(items: Item[], ignore: string | null, size: Size, target: Cell, grid: Grid): Cell | null {
  let best: Cell | null = null
  let bestD = Infinity
  for (let row = 0; row < grid.rows; row++)
    for (let col = 0; col < grid.cols; col++) {
      const d = (col - target.col) ** 2 + (row - target.row) ** 2
      if (d < bestD && fits(items, { col, row, size }, grid, ignore)) {
        best = { col, row }
        bestD = d
      }
    }
  return best
}

export function firstFree(items: Item[], size: Size, grid: Grid): Cell | null {
  for (let row = 0; row < grid.rows; row++)
    for (let col = 0; col < grid.cols; col++) if (fits(items, { col, row, size }, grid)) return { col, row }
  return null
}

// the allowed size whose box is closest to a dragged w x h
export function nearestSize(allowed: Size[], w: number, h: number, grid: Grid = NOMINAL): Size {
  let best = allowed[0]
  let bestD = Infinity
  for (const s of allowed) {
    const p = sizePx(s, grid)
    const d = Math.abs(p.w - w) + Math.abs(p.h - h)
    if (d < bestD) {
      best = s
      bestD = d
    }
  }
  return best
}

// fit every widget into `grid`: ones already clear stay put, the rest move to the nearest free
// spot. A widget with no room left keeps its clamped position rather than being lost.
export function reflow(items: Item[], grid: Grid): Item[] {
  const placed: Item[] = []
  const pending: Item[] = []
  for (const it of items) (fits(placed, it, grid) ? placed : pending).push(it)
  const out = new Map(placed.map((it) => [it.id, it]))
  for (const it of pending) {
    const s = SPANS[it.size]
    const clamped = {
      col: Math.max(0, Math.min(it.col, grid.cols - s.w)),
      row: Math.max(0, Math.min(it.row, grid.rows - s.h)),
    }
    const spot = nearestFree([...out.values()], null, it.size, clamped, grid) ?? clamped
    out.set(it.id, { ...it, ...spot })
  }
  return items.map((it) => out.get(it.id)!)
}

// carry a layout from the grid it was arranged on to another one (the monitor's scale changed).
// Widgets that touch move together, so a stacked column stays stacked. On each axis a group keeps
// its distance to the nearer edge (flush stays flush), or its relative place if it sits in the middle third, then
// reflow settles any overlaps. Shown only: the saved layout is kept.
export type Extent = { cols: number; rows: number }

function anchor(start: number, span: number, from: number, to: number) {
  if (from === to) return start
  // flush against an edge stays flush, however far it reaches
  if (start === 0) return 0
  if (start + span === from) return Math.max(0, to - span)
  const centre = start + span / 2
  const at =
    centre < from / 3 ? start : centre > (2 * from) / 3 ? to - (from - start) : Math.round((centre / from) * to - span / 2)
  return Math.max(0, Math.min(at, to - span))
}

const box = (it: Item) => {
  const s = SPANS[it.size]
  return { c0: it.col, r0: it.row, c1: it.col + s.w, r1: it.row + s.h }
}

// sharing an edge or a corner counts as touching
function touches(a: Item, b: Item) {
  const p = box(a)
  const q = box(b)
  return p.c0 <= q.c1 && q.c0 <= p.c1 && p.r0 <= q.r1 && q.r0 <= p.r1
}

function groups(items: Item[]): number[][] {
  const parent = items.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) if (touches(items[i], items[j])) parent[find(i)] = find(j)
  const out = new Map<number, number[]>()
  items.forEach((_, i) => out.set(find(i), [...(out.get(find(i)) ?? []), i]))
  return [...out.values()]
}

export function adapt(items: Item[], from: Extent, to: Grid): Item[] {
  if (from.cols === to.cols && from.rows === to.rows) return reflow(items, to)
  const moved = [...items]
  for (const g of groups(items)) {
    const b = g.map((i) => box(items[i]))
    const c0 = Math.min(...b.map((x) => x.c0))
    const r0 = Math.min(...b.map((x) => x.r0))
    const w = Math.max(...b.map((x) => x.c1)) - c0
    const h = Math.max(...b.map((x) => x.r1)) - r0
    const dc = anchor(c0, w, from.cols, to.cols) - c0
    const dr = anchor(r0, h, from.rows, to.rows) - r0
    if (dc || dr) for (const i of g) moved[i] = { ...items[i], col: items[i].col + dc, row: items[i].row + dr }
  }
  return reflow(moved, to)
}

export function makeId(kind: string, items: Item[]) {
  const n = items.reduce((max, it) => {
    const m = it.id.match(/-(\d+)$/)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
  return `${kind}-${n + 1}`
}

// `grid`: the extent the layout was arranged on, so another scale can re-anchor it
export const serialize = (items: Item[], grid?: Extent) =>
  JSON.stringify({ version: VERSION, ...(grid && { grid: { cols: grid.cols, rows: grid.rows } }), widgets: items }, null, 2)

// the extent saved with the layout; null for a file written before it was recorded
export function parseExtent(text: string): Extent | null {
  try {
    const g = JSON.parse(text)?.grid
    return isInt(g?.cols) && isInt(g?.rows) && g.cols > 0 && g.rows > 0 ? { cols: g.cols, rows: g.rows } : null
  } catch {
    return null
  }
}

const isInt = (v: unknown): v is number => Number.isInteger(v)

// null: the file is unreadable as a whole. Otherwise the valid widgets, dropping unknown kinds
// (sizesOf returns undefined), sizes the kind doesn't support, and malformed entries.
export function parseLayout(text: string, sizesOf: (kind: string) => Size[] | undefined): Item[] | null {
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (data?.version !== VERSION || !Array.isArray(data.widgets)) return null
  const out: Item[] = []
  for (const w of data.widgets) {
    if (!w || typeof w.id !== "string" || typeof w.kind !== "string") continue
    if (!sizesOf(w.kind)?.includes(w.size) || !isInt(w.col) || !isInt(w.row)) continue
    const config = w.config && typeof w.config === "object" && !Array.isArray(w.config) ? w.config : {}
    out.push({ id: w.id, kind: w.kind, size: w.size, col: w.col, row: w.row, config })
  }
  return out
}

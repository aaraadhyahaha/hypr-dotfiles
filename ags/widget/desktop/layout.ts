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

export function makeId(kind: string, items: Item[]) {
  const n = items.reduce((max, it) => {
    const m = it.id.match(/-(\d+)$/)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
  return `${kind}-${n + 1}`
}

export const serialize = (items: Item[]) => JSON.stringify({ version: VERSION, widgets: items }, null, 2)

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

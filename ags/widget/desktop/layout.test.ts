import { test } from "node:test"
import assert from "node:assert/strict"
import {
  CELL,
  GAP,
  MARGIN,
  NOMINAL,
  PITCH,
  cellToPx,
  firstFree,
  fits,
  gridFor,
  makeId,
  nearestFree,
  nearestSize,
  parseLayout,
  pxToCell,
  reflow,
  serialize,
  sizePx,
  type Item,
  type Size,
} from "./layout.ts"

const item = (id: string, size: Size, col: number, row: number, kind = "clock"): Item => ({
  id,
  kind,
  size,
  col,
  row,
  config: {},
})

const grid = { ...NOMINAL, cols: 17, rows: 9 }

test("the grid fills the usable area between the margins", () => {
  // 1536x816 logical: the monitor minus the bar's exclusive zone
  const g = gridFor(1536, 816)
  assert.deepEqual([g.cols, g.rows], [17, 9])
  assert.equal(PITCH, CELL + GAP)
})

test("stretched cells reach the right and bottom margins", () => {
  const g = gridFor(1536, 816)
  assert.equal(cellToPx(g, g.cols, 0).x - GAP, 1536 - MARGIN)
  assert.equal(cellToPx(g, 0, g.rows).y - GAP, 816 - MARGIN)
  assert.ok(sizePx("s", g).w > sizePx("s").w)
  assert.ok(sizePx("s", g).h > sizePx("s").h)
})

test("a tiny area still has one cell", () => {
  assert.deepEqual(gridFor(10, 10), { cols: 1, rows: 1, px: PITCH, py: PITCH })
})

test("sizes span whole cells and the gaps between them", () => {
  assert.deepEqual(sizePx("s"), { w: 156, h: 156 })
  assert.deepEqual(sizePx("m"), { w: 324, h: 156 })
  assert.deepEqual(sizePx("l"), { w: 324, h: 324 })
  assert.deepEqual(sizePx("xl"), { w: 660, h: 324 })
})

test("cell and pixel positions round-trip, and pixels snap to the nearest cell", () => {
  assert.deepEqual(cellToPx(NOMINAL, 0, 0), { x: MARGIN, y: MARGIN })
  assert.deepEqual(cellToPx(NOMINAL, 3, 2), { x: MARGIN + 3 * PITCH, y: MARGIN + 2 * PITCH })
  assert.deepEqual(pxToCell(NOMINAL, MARGIN + 3 * PITCH + 30, MARGIN + 2 * PITCH - 30), { col: 3, row: 2 })
  assert.deepEqual(pxToCell(NOMINAL, MARGIN + 3 * PITCH + 50, MARGIN), { col: 4, row: 0 })
})

test("a rect fits only inside the grid and off other widgets", () => {
  const items = [item("a", "s", 0, 0)]
  assert.equal(fits(items, { col: 2, row: 0, size: "s" }, grid), true)
  assert.equal(fits(items, { col: 1, row: 1, size: "s" }, grid), false)
  assert.equal(fits(items, { col: 16, row: 0, size: "s" }, grid), false) // past the right edge
  assert.equal(fits(items, { col: 0, row: -1, size: "s" }, grid), false)
  // a widget never collides with itself
  assert.equal(fits(items, { col: 1, row: 1, size: "s" }, grid, "a"), true)
})

test("nearestFree keeps a free target as is", () => {
  const items = [item("a", "s", 0, 0), item("b", "s", 6, 0)]
  assert.deepEqual(nearestFree(items, "b", "s", { col: 3, row: 3 }, grid), { col: 3, row: 3 })
})

test("dropping onto a widget moves the dragged one to the closest free spot, not the other", () => {
  const items = [item("a", "l", 4, 0), item("b", "s", 0, 6)]
  // aiming one cell into a's left edge: the free slot just left of a is closest
  assert.deepEqual(nearestFree(items, "b", "s", { col: 3, row: 1 }, grid), { col: 2, row: 1 })
})

test("equally close spots go to the upper one, then the left one", () => {
  const items = [item("a", "m", 4, 2), item("b", "s", 0, 6)]
  // (4,0), (2,2) and (4,4) are all two cells away
  assert.deepEqual(nearestFree(items, "b", "s", { col: 4, row: 2 }, grid), { col: 4, row: 0 })
})

test("nearestFree clamps a target past the edge back into the grid", () => {
  assert.deepEqual(nearestFree([], null, "l", { col: 30, row: 30 }, grid), { col: 13, row: 5 })
})

test("nearestFree returns null when nothing fits", () => {
  const full = [item("a", "xl", 0, 0), item("b", "xl", 8, 0), item("c", "xl", 0, 4), item("d", "xl", 8, 4)]
  assert.equal(nearestFree(full, null, "xl", { col: 0, row: 0 }, { ...NOMINAL, cols: 16, rows: 8 }), null)
})

test("firstFree scans from the top-left, row by row", () => {
  const items = [item("a", "s", 0, 0)]
  assert.deepEqual(firstFree(items, "s", grid), { col: 2, row: 0 })
  assert.deepEqual(firstFree([], "l", grid), { col: 0, row: 0 })
})

test("nearestSize snaps a dragged corner to the closest allowed size", () => {
  const all: Size[] = ["s", "m", "l", "xl"]
  assert.equal(nearestSize(all, 170, 160), "s")
  assert.equal(nearestSize(all, 300, 170), "m")
  assert.equal(nearestSize(all, 330, 300), "l")
  assert.equal(nearestSize(all, 900, 400), "xl")
  // only sizes the widget supports
  assert.equal(nearestSize(["s", "l"], 330, 160), "l")
})

test("reflow keeps widgets that still fit and moves the rest inside", () => {
  const items = [item("a", "s", 0, 0), item("b", "l", 14, 6)]
  const out = reflow(items, grid)
  assert.deepEqual(out[0], items[0])
  assert.deepEqual({ col: out[1].col, row: out[1].row }, { col: 13, row: 5 })
})

test("reflow resolves widgets that now overlap", () => {
  const items = [item("a", "s", 0, 0), item("b", "s", 1, 1)]
  const out = reflow(items, grid)
  assert.equal(fits([out[0]], { col: out[1].col, row: out[1].row, size: "s" }, grid), true)
})

test("reflow never drops a widget, even with no room left", () => {
  const out = reflow([item("a", "xl", 0, 0), item("b", "xl", 0, 0)], { ...NOMINAL, cols: 8, rows: 4 })
  assert.equal(out.length, 2)
})

const kinds = { clock: ["s", "m"] as Size[], note: ["s", "m", "l"] as Size[] }
const sizesOf = (k: string) => kinds[k as keyof typeof kinds]

test("serialize and parseLayout round-trip", () => {
  const items = [item("clock-1", "s", 0, 0), { ...item("note-1", "m", 2, 0, "note"), config: { text: "hi" } }]
  assert.deepEqual(parseLayout(serialize(items), sizesOf), items)
})

test("parseLayout returns null for a corrupt file", () => {
  assert.equal(parseLayout("{not json", sizesOf), null)
  assert.equal(parseLayout('{"version":1}', sizesOf), null)
  assert.equal(parseLayout('{"version":99,"widgets":[]}', sizesOf), null)
})

test("parseLayout drops unknown kinds, unsupported sizes and malformed entries", () => {
  const text = JSON.stringify({
    version: 1,
    widgets: [
      item("clock-1", "s", 0, 0),
      item("ghost-1", "s", 2, 0, "ghost"),
      item("clock-2", "xl", 4, 0), // clock has no xl
      { id: "clock-3", kind: "clock", size: "s", col: "x", row: 0 },
      null,
    ],
  })
  assert.deepEqual(parseLayout(text, sizesOf), [item("clock-1", "s", 0, 0)])
})

test("parseLayout fills a missing config with an empty object", () => {
  const text = JSON.stringify({ version: 1, widgets: [{ id: "c", kind: "clock", size: "s", col: 0, row: 0 }] })
  assert.deepEqual(parseLayout(text, sizesOf), [item("c", "s", 0, 0)])
})

test("makeId never reuses an id", () => {
  assert.equal(makeId("clock", []), "clock-1")
  assert.equal(makeId("clock", [item("clock-1", "s", 0, 0), item("clock-4", "s", 2, 0)]), "clock-5")
})

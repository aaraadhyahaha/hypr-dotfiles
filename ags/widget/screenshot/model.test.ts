import { test } from "node:test"
import assert from "node:assert/strict"
import {
  TIMERS, nextTimer, timerLabel, windowGeometry,
  type Client, type Rect, defaultRect, dragRect, geometry, hitTest, windowAt,
} from "./model.ts"

test("nextTimer cycles through the delays and wraps", () => {
  assert.equal(nextTimer(0), 3)
  assert.equal(nextTimer(TIMERS[TIMERS.length - 1]), 0)
  assert.equal(nextTimer(7), 0) // unknown value starts over
})

test("timerLabel", () => {
  assert.equal(timerLabel(3), "3s")
  assert.equal(timerLabel(0), "Off")
})

test("windowGeometry reads hyprctl activewindow -j as grim's x,y wxh", () => {
  assert.equal(windowGeometry('{"at":[12,60],"size":[1512,792]}'), "12,60 1512x792")
  assert.equal(windowGeometry("{}"), null)
  assert.equal(windowGeometry("not json"), null)
})

const B: Rect = { x: 0, y: 0, w: 1000, h: 800 }
const R: Rect = { x: 100, y: 100, w: 200, h: 100 }

test("defaultRect is centred at half size", () => {
  assert.deepEqual(defaultRect(B), { x: 250, y: 200, w: 500, h: 400 })
})

test("hitTest: corners, edges, inside, outside", () => {
  assert.equal(hitTest(R, 100, 100), "nw")
  assert.equal(hitTest(R, 305, 205), "se")
  assert.equal(hitTest(R, 300, 100), "ne")
  assert.equal(hitTest(R, 92, 200), "sw")
  assert.equal(hitTest(R, 200, 98), "n")
  assert.equal(hitTest(R, 200, 200), "s")
  assert.equal(hitTest(R, 100, 150), "w")
  assert.equal(hitTest(R, 310, 150), "e")
  assert.equal(hitTest(R, 200, 150), "move")
  assert.equal(hitTest(R, 500, 500), "new")
  assert.equal(hitTest(R, 200, 120), "move") // just past the grab zone
  assert.equal(hitTest(R, 200, 112), "n")
  assert.equal(hitTest(R, 50, 150), "new") // beside the rect, out of reach
})

test("hitTest: on a tiny rect the nearer edge wins", () => {
  const t = { x: 100, y: 100, w: 4, h: 4 }
  assert.equal(hitTest(t, 99, 99), "nw")
  assert.equal(hitTest(t, 105, 105), "se")
})

test("dragRect resizes by the grabbed edges", () => {
  assert.deepEqual(dragRect(R, "se", [300, 200], 50, 20, B), { x: 100, y: 100, w: 250, h: 120 })
  assert.deepEqual(dragRect(R, "nw", [100, 100], -10, -20, B), { x: 90, y: 80, w: 210, h: 120 })
  assert.deepEqual(dragRect(R, "e", [300, 150], 30, 99, B), { x: 100, y: 100, w: 230, h: 100 })
  assert.deepEqual(dragRect(R, "n", [200, 100], 99, 30, B), { x: 100, y: 130, w: 200, h: 70 })
})

test("dragRect flips through the opposite edge", () => {
  assert.deepEqual(dragRect(R, "e", [300, 150], -250, 0, B), { x: 50, y: 100, w: 50, h: 100 })
  assert.deepEqual(dragRect(R, "nw", [100, 100], 300, 150, B), { x: 300, y: 200, w: 100, h: 50 })
})

test("dragRect clamps to bounds", () => {
  assert.deepEqual(dragRect(R, "nw", [100, 100], -500, -500, B), { x: 0, y: 0, w: 300, h: 200 })
  assert.deepEqual(dragRect(R, "move", [150, 150], 2000, -2000, B), { x: 800, y: 0, w: 200, h: 100 })
  assert.deepEqual(dragRect(R, "move", [150, 150], 10, 5, B), { x: 110, y: 105, w: 200, h: 100 })
})

test("dragRect new spans from the press point, either direction", () => {
  assert.deepEqual(dragRect(R, "new", [500, 500], 100, 50, B), { x: 500, y: 500, w: 100, h: 50 })
  assert.deepEqual(dragRect(R, "new", [500, 500], -100, -50, B), { x: 400, y: 450, w: 100, h: 50 })
  assert.deepEqual(dragRect(R, "new", [900, 700], 500, 500, B), { x: 900, y: 700, w: 100, h: 100 })
})

test("geometry offsets by the output origin and rounds", () => {
  assert.equal(geometry({ x: 10.4, y: 20.6, w: 99.5, h: 50 }, { x: 1920, y: 0 }), "1930,21 100x50")
})

const win = (o: Partial<Client>): Client =>
  ({ at: [0, 0], size: [500, 500], workspace: { id: 1 }, focusHistoryID: 5, ...o })

test("windowAt: floating above tiled, then most recently focused", () => {
  const tiledOld = win({ focusHistoryID: 3 })
  const tiledNew = win({ focusHistoryID: 1 })
  const float = win({ floating: true, focusHistoryID: 9, at: [100, 100], size: [100, 100] })
  assert.equal(windowAt([tiledOld, tiledNew, float], [1], 150, 150), float)
  assert.equal(windowAt([tiledOld, tiledNew, float], [1], 50, 50), tiledNew)
})

test("windowAt skips hidden, unmapped and off-workspace windows; pinned always shows", () => {
  const other = win({ workspace: { id: 2 }, focusHistoryID: 0 })
  const hidden = win({ hidden: true, focusHistoryID: 0 })
  const unmapped = win({ mapped: false, focusHistoryID: 0 })
  const shown = win({ focusHistoryID: 4 })
  assert.equal(windowAt([other, hidden, unmapped, shown], [1], 10, 10), shown)
  assert.equal(windowAt([other], [1], 10, 10), null)
  const pinned = win({ workspace: { id: 7 }, pinned: true })
  assert.equal(windowAt([pinned], [1], 10, 10), pinned)
  assert.equal(windowAt([shown], [1], 600, 10), null) // outside every window
})

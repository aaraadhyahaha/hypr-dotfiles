import { test } from "node:test"
import assert from "node:assert/strict"
import { initialSel, step, reconcile } from "./nav.ts"

const IDS = [1, 2, 3, 4]

test("opens on the focused workspace, workspace row selected", () => {
  assert.deepEqual(initialSel(3, IDS), { row: "ws", ws: 2, win: 0 })
})

test("unknown or missing focused workspace falls back to the first", () => {
  assert.deepEqual(initialSel(9, IDS), { row: "ws", ws: 0, win: 0 })
  assert.deepEqual(initialSel(undefined, IDS), { row: "ws", ws: 0, win: 0 })
})

test("left/right move between workspaces, clamped, and reset the window index", () => {
  assert.deepEqual(step({ row: "ws", ws: 1, win: 2 }, "right", 4, 3), { row: "ws", ws: 2, win: 0 })
  assert.deepEqual(step({ row: "ws", ws: 1, win: 2 }, "left", 4, 3), { row: "ws", ws: 0, win: 0 })
  assert.deepEqual(step({ row: "ws", ws: 0, win: 0 }, "left", 4, 3), { row: "ws", ws: 0, win: 0 })
  assert.deepEqual(step({ row: "ws", ws: 3, win: 0 }, "right", 4, 3), { row: "ws", ws: 3, win: 0 })
})

test("tab behaves like right", () => {
  assert.deepEqual(step({ row: "ws", ws: 0, win: 0 }, "tab", 4, 0), { row: "ws", ws: 1, win: 0 })
  assert.deepEqual(step({ row: "win", ws: 0, win: 0 }, "tab", 4, 2), { row: "win", ws: 0, win: 1 })
})

test("down enters the window row only when the previewed workspace has windows", () => {
  assert.deepEqual(step({ row: "ws", ws: 1, win: 0 }, "down", 4, 2), { row: "win", ws: 1, win: 0 })
  assert.deepEqual(step({ row: "ws", ws: 1, win: 0 }, "down", 4, 0), { row: "ws", ws: 1, win: 0 })
})

test("left/right in the window row move between windows, clamped, workspace unchanged", () => {
  assert.deepEqual(step({ row: "win", ws: 2, win: 0 }, "right", 4, 3), { row: "win", ws: 2, win: 1 })
  assert.deepEqual(step({ row: "win", ws: 2, win: 2 }, "right", 4, 3), { row: "win", ws: 2, win: 2 })
  assert.deepEqual(step({ row: "win", ws: 2, win: 0 }, "left", 4, 3), { row: "win", ws: 2, win: 0 })
})

test("up returns to the workspace row, keeping the workspace", () => {
  assert.deepEqual(step({ row: "win", ws: 2, win: 1 }, "up", 4, 3), { row: "ws", ws: 2, win: 1 })
})

test("reconcile clamps the window index when the list shrinks", () => {
  assert.deepEqual(reconcile({ row: "win", ws: 1, win: 3 }, 2), { row: "win", ws: 1, win: 1 })
  assert.deepEqual(reconcile({ row: "ws", ws: 1, win: 0 }, 5), { row: "ws", ws: 1, win: 0 })
})

test("reconcile drops to the workspace row when the last window closes", () => {
  assert.deepEqual(reconcile({ row: "win", ws: 1, win: 0 }, 0), { row: "ws", ws: 1, win: 0 })
})

test("reconcile returns the same object when nothing changes (avoids state churn)", () => {
  const s = { row: "win" as const, ws: 0, win: 1 }
  assert.equal(reconcile(s, 3), s)
})

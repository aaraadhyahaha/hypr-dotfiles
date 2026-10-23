import { test } from "node:test"
import assert from "node:assert/strict"
import { heatAlpha, heatCell, sessionOf } from "./model.ts"

test("sessionOf counts the focus session being worked on", () => {
  assert.equal(sessionOf("focus", 0, 4), 1)
  assert.equal(sessionOf("focus", 2, 4), 3)
  assert.equal(sessionOf("focus", 4, 4), 1)
})

test("sessionOf counts the session a break follows", () => {
  assert.equal(sessionOf("short", 1, 4), 1)
  assert.equal(sessionOf("short", 3, 4), 3)
  assert.equal(sessionOf("long", 4, 4), 4)
  assert.equal(sessionOf("long", 8, 4), 4)
})

test("sessionOf: a break skipped into before any session reads as the first", () => {
  assert.equal(sessionOf("short", 0, 4), 1)
})

test("heatAlpha spans the faint empty cell up to full at the goal", () => {
  assert.equal(heatAlpha(0, 8), 0.06)
  assert.equal(heatAlpha(8, 8), 1)
  assert.equal(heatAlpha(20, 8), 1)
  const half = heatAlpha(4, 8)
  assert.ok(half > heatAlpha(1, 8) && half < 1)
})

test("heatCell fits 18 columns with 3px gaps into the width", () => {
  assert.equal(heatCell(300), (300 - 17 * 3) / 18)
})

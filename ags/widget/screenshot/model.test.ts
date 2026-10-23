import { test } from "node:test"
import assert from "node:assert/strict"
import { TIMERS, nextTimer, timerLabel, windowGeometry } from "./model.ts"

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

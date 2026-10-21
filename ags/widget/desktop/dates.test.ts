import { test } from "node:test"
import assert from "node:assert/strict"
import { countdownLabel, daysUntil, monthGrid, progressBetween } from "./dates.ts"

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h)

test("daysUntil counts calendar days, whatever the time of day", () => {
  assert.equal(daysUntil("2026-11-20", at(2026, 10, 21, 23)), 30)
  assert.equal(daysUntil("2026-10-22", at(2026, 10, 21, 0)), 1)
  assert.equal(daysUntil("2026-10-21", at(2026, 10, 21, 23)), 0)
  assert.equal(daysUntil("2026-10-18", at(2026, 10, 21)), -3)
})

test("daysUntil crosses a DST change without an off-by-one", () => {
  // Europe moves clocks on 25 Oct 2026; whole days must still count as whole days
  assert.equal(daysUntil("2026-10-26", at(2026, 10, 24)), 2)
})

test("daysUntil is null for a bad date", () => {
  assert.equal(daysUntil("someday", at(2026, 10, 21)), null)
  assert.equal(daysUntil("2026-13-40", at(2026, 10, 21)), null)
})

test("countdownLabel reads naturally", () => {
  assert.equal(countdownLabel(30), "30 days to go")
  assert.equal(countdownLabel(1), "Tomorrow")
  assert.equal(countdownLabel(0), "Today")
  assert.equal(countdownLabel(-1), "Yesterday")
  assert.equal(countdownLabel(-12), "12 days ago")
  assert.equal(countdownLabel(null), "Pick a date")
})

test("progressBetween runs from the day it was set to the target", () => {
  assert.equal(progressBetween("2026-10-01", "2026-10-31", at(2026, 10, 16)), 0.5)
  assert.equal(progressBetween("2026-10-01", "2026-10-31", at(2026, 9, 20)), 0)
  assert.equal(progressBetween("2026-10-01", "2026-10-31", at(2026, 11, 5)), 1)
  // set on the day itself
  assert.equal(progressBetween("2026-10-21", "2026-10-21", at(2026, 10, 21)), 1)
  assert.equal(progressBetween("bad", "2026-10-21", at(2026, 10, 21)), 0)
})

test("monthGrid is six Monday-first weeks covering the month", () => {
  const g = monthGrid(2026, 10) // October 2026 starts on a Thursday
  assert.equal(g.length, 42)
  assert.deepEqual(g.slice(0, 4).map((c) => [c.day, c.inMonth]), [
    [28, false],
    [29, false],
    [30, false],
    [1, true],
  ])
  assert.equal(g.filter((c) => c.inMonth).length, 31)
  assert.deepEqual([g[41].day, g[41].inMonth], [8, false])
})

test("monthGrid handles a month starting on Monday", () => {
  const g = monthGrid(2026, 6) // 1 June 2026 is a Monday
  assert.deepEqual([g[0].day, g[0].inMonth], [1, true])
})

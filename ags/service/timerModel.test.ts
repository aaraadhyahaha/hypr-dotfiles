import { test } from "node:test"
import assert from "node:assert/strict"
import { fmtSpan, fmtLeft, fmtClock, splitDue, sanitize, timerTitle } from "./timerModel.ts"

test("fmtSpan names hours, minutes and leftover seconds", () => {
  assert.equal(fmtSpan(600), "10 min")
  assert.equal(fmtSpan(5400), "1 h 30 min")
  assert.equal(fmtSpan(3600), "1 h")
  assert.equal(fmtSpan(45), "45 s")
  assert.equal(fmtSpan(125), "2 min 5 s")
  assert.equal(fmtSpan(0), "0 s")
  assert.equal(fmtSpan(-3), "0 s")
})

test("fmtLeft is a clock that rounds partial seconds up", () => {
  assert.equal(fmtLeft(245), "4:05")
  assert.equal(fmtLeft(3723), "1:02:03")
  assert.equal(fmtLeft(0.2), "0:01")
  assert.equal(fmtLeft(-1), "0:00")
})

test("fmtClock is local hh:mm", () => {
  assert.equal(fmtClock(new Date(2026, 0, 2, 9, 5).getTime()), "09:05")
  assert.equal(fmtClock(new Date(2026, 0, 2, 14, 32, 59).getTime()), "14:32")
})

test("splitDue separates finished timers and sorts both soonest first", () => {
  const t = (id: number, endWall: number) => ({ id, label: "", secs: 60, endWall })
  const { live, due } = splitDue([t(1, 300), t(2, 100), t(3, 200), t(4, 50)], 150)
  assert.deepEqual(live.map((x) => x.id), [3, 1])
  assert.deepEqual(due.map((x) => x.id), [4, 2])
  // ending exactly now counts as due
  assert.deepEqual(splitDue([t(5, 150)], 150).due.map((x) => x.id), [5])
})

test("sanitize keeps well-formed timers and drops the rest", () => {
  assert.deepEqual(sanitize(null), [])
  assert.deepEqual(sanitize({}), [])
  assert.deepEqual(
    sanitize([
      { id: 1, label: "tea", secs: 600, endWall: 1000 },
      { id: 2, secs: 60, endWall: 5 },
      { id: 1.5, secs: 60, endWall: 5 },
      { id: 3, secs: 0, endWall: 5 },
      { id: 4, secs: 60, endWall: "soon" },
      { id: 5, secs: 60, endWall: Infinity },
      null,
      "x",
    ]),
    [
      { id: 1, label: "tea", secs: 600, endWall: 1000 },
      { id: 2, label: "", secs: 60, endWall: 5 },
    ],
  )
})

test("timerTitle puts the label first", () => {
  assert.equal(timerTitle({ label: "tea", secs: 600 }), "tea · 10 min")
  assert.equal(timerTitle({ label: "", secs: 90 }), "1 min 30 s")
})

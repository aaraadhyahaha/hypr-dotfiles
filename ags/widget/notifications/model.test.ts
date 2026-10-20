import { test } from "node:test"
import assert from "node:assert/strict"
import { toastTimeout, relTime, groupByApp } from "./model.ts"

test("expireTimeout -1 means the server default", () => {
  assert.equal(toastTimeout({ expireTimeout: -1, urgency: 1 }), 5000)
  assert.equal(toastTimeout({ expireTimeout: -1, urgency: 1 }, 3000), 3000)
})

test("expireTimeout 0 never expires", () => {
  assert.equal(toastTimeout({ expireTimeout: 0, urgency: 1 }), null)
})

test("critical notifications never expire, whatever they ask for", () => {
  assert.equal(toastTimeout({ expireTimeout: 8000, urgency: 2 }), null)
})

test("an explicit expireTimeout is honoured", () => {
  assert.equal(toastTimeout({ expireTimeout: 1500, urgency: 1 }), 1500)
})

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime() / 1000

test("relTime: under a minute is now", () => {
  assert.equal(relTime(1000, 1000 - 30), "now")
})

test("relTime: minutes then hours", () => {
  assert.equal(relTime(10_000, 10_000 - 5 * 60), "5m")
  assert.equal(relTime(100_000, 100_000 - 3 * 3600 - 59), "3h")
})

test("relTime: weekday within a week, date after", () => {
  // 2026-10-20 is a Tuesday
  assert.equal(relTime(at(2026, 9, 20), at(2026, 9, 19)), "Mon")
  assert.equal(relTime(at(2026, 9, 20), at(2026, 9, 12)), "12 Oct")
})

test("groupByApp: newest group first, items newest first", () => {
  const list = [
    { appName: "A", time: 1, id: 1 },
    { appName: "B", time: 5, id: 3 },
    { appName: "A", time: 3, id: 2 },
  ]
  const g = groupByApp(list)
  assert.deepEqual(g.map((x) => x.app), ["B", "A"])
  assert.deepEqual(g[1].items.map((x) => x.time), [3, 1])
})

test("groupByApp: same-second notifications fall back to id order", () => {
  // notifd times are whole seconds, so a burst ties; ids only grow
  const list = [
    { appName: "A", time: 7, id: 2 },
    { appName: "A", time: 7, id: 3 },
    { appName: "A", time: 7, id: 1 },
    { appName: "B", time: 7, id: 4 },
  ]
  const g = groupByApp(list)
  assert.deepEqual(g.map((x) => x.app), ["B", "A"])
  assert.deepEqual(g[1].items.map((x) => x.id), [3, 2, 1])
})

test("groupByApp: empty list gives no groups", () => {
  assert.deepEqual(groupByApp([]), [])
})

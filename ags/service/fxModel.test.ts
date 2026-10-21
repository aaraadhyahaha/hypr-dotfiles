import { test } from "node:test"
import assert from "node:assert/strict"
import { hm, parseStatus, sinceMinutes } from "./fxModel.ts"

const raw = {
  date: "2026-10-21",
  checked_in: true,
  score: 41,
  completion: 0.252,
  focus: 0.788,
  focus_min: 189.2,
  target_min: 240,
  idle_min: 129.3,
  window: ["15:15", "20:30"],
  hourly: [9.8, 59.9, 45, 55.1, 15.8, 0],
  streak: { days: 1, status: "clean" },
  active: { task_id: 41, title: "SQL B", since: "2026-10-21T16:00:00" },
  tasks: [
    { id: 41, title: "SQL B", severity: 5, effort: 90, done: false, minutes: 12.5 },
    { id: 7, title: "Text files", severity: 4, effort: 60, done: true, minutes: 60 },
  ],
}

test("parseStatus maps fx's JSON to camelCase", () => {
  const s = parseStatus(JSON.stringify(raw))!
  assert.equal(s.score, 41)
  assert.equal(s.focusMin, 189.2)
  assert.equal(s.targetMin, 240)
  assert.deepEqual(s.window, ["15:15", "20:30"])
  assert.deepEqual(s.streak, { days: 1, status: "clean" })
  assert.deepEqual(s.active, { taskId: 41, title: "SQL B", since: "2026-10-21T16:00:00" })
  assert.deepEqual(s.tasks[1], { id: 7, title: "Text files", severity: 4, effort: 60, done: true, minutes: 60 })
})

test("parseStatus keeps a null active session", () => {
  assert.equal(parseStatus(JSON.stringify({ ...raw, active: null }))!.active, null)
})

test("parseStatus rejects output that isn't fx status", () => {
  assert.equal(parseStatus(""), null)
  assert.equal(parseStatus("Traceback (most recent call last):"), null)
  assert.equal(parseStatus(JSON.stringify({ score: 1 })), null) // no tasks
  assert.equal(parseStatus(JSON.stringify({ ...raw, score: "41" })), null)
})

test("parseStatus drops malformed tasks and clamps severity", () => {
  const s = parseStatus(JSON.stringify({ ...raw, tasks: [{ id: 1 }, { ...raw.tasks[0], severity: 9 }] }))!
  assert.equal(s.tasks.length, 1)
  assert.equal(s.tasks[0].severity, 5)
})

test("parseStatus treats an unknown streak status as clean", () => {
  assert.equal(parseStatus(JSON.stringify({ ...raw, streak: { days: 2, status: "??" } }))!.streak.status, "clean")
})

test("hm formats minutes like fx does", () => {
  assert.equal(hm(189.2), "3h09")
  assert.equal(hm(45), "45m")
  assert.equal(hm(0), "0m")
  assert.equal(hm(60), "1h00")
})

test("sinceMinutes counts whole minutes from a local ISO time", () => {
  const now = new Date(2026, 9, 21, 16, 25, 40)
  assert.equal(sinceMinutes("2026-10-21T16:00:00", now), 25)
  assert.equal(sinceMinutes("not a date", now), 0)
})

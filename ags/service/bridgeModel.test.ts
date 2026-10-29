import { test } from "node:test"
import assert from "node:assert/strict"
import type { FxStatus, FxTask } from "./fxModel.ts"
import {
  type Bridge,
  stoppedTask,
  isShutdown,
  dayOver,
  dayOf,
  put,
  noteFor,
  morningNote,
  STEM,
  written,
  shown,
  retire,
  markSeenIn,
  prune,
  parseBridges,
  serialize,
} from "./bridgeModel.ts"

const task = (id: number, done = false): FxTask => ({ id, title: `task ${id}`, severity: 1, effort: 0, done, minutes: 0 })

const status = (active: number | null | undefined, tasks: FxTask[] = [task(1), task(2)], extra: Partial<FxStatus> = {}): FxStatus => ({
  date: "2026-10-29",
  checkedIn: true,
  score: 0,
  completion: 0,
  focus: 0,
  focusMin: 0,
  targetMin: 240,
  idleMin: 0,
  window: ["09:00", "22:00"],
  hourly: [],
  streak: { days: 0, status: "clean" },
  active: active === undefined ? null : { taskId: active, title: active === null ? null : `task ${active}`, since: "2026-10-29T10:00:00" },
  tasks,
  ...extra,
})

const note = (over: Partial<Bridge>): Bridge => ({
  taskId: 1,
  title: "task 1",
  text: "next",
  pickup: "",
  at: "2026-10-29T10:00:00",
  kind: "task",
  seen: false,
  ...over,
})

test("stoppedTask fires when a focused task stops or is switched away from", () => {
  assert.deepEqual(stoppedTask(status(1), status(undefined)), { id: 1, title: "task 1" })
  assert.deepEqual(stoppedTask(status(1), status(2)), { id: 1, title: "task 1" })
  // untasked focus started right after
  assert.deepEqual(stoppedTask(status(1), status(null)), { id: 1, title: "task 1" })
})

test("stoppedTask ignores done tasks, unchanged focus and untasked sessions", () => {
  assert.equal(stoppedTask(status(1), status(undefined, [task(1, true), task(2)])), null)
  assert.equal(stoppedTask(status(1), status(1)), null)
  assert.equal(stoppedTask(null, status(undefined)), null)
  assert.equal(stoppedTask(status(undefined), status(1)), null)
  assert.equal(stoppedTask(status(null), status(undefined)), null)
})

test("stoppedTask falls back to the old title when the task is gone from the list", () => {
  assert.deepEqual(stoppedTask(status(3), status(undefined)), { id: 3, title: "task 3" })
})

test("stoppedTask ignores the Shutdown task", () => {
  const shut: FxTask = { ...task(5), title: "Shutdown" }
  assert.equal(stoppedTask(status(5, [shut]), status(undefined, [shut])), null)
})

test("isShutdown matches the word, any case", () => {
  assert.ok(isShutdown("Shutdown"))
  assert.ok(isShutdown("daily shutdown ritual"))
  assert.ok(!isShutdown("shutdowns"))
  assert.ok(!isShutdown(null))
  assert.ok(!isShutdown(""))
})

test("dayOver: target reached or the window has closed", () => {
  const noon = new Date(2026, 9, 29, 12, 0)
  assert.ok(!dayOver(status(undefined), noon))
  assert.ok(dayOver(status(undefined, [], { focusMin: 240 }), noon))
  assert.ok(dayOver(status(undefined), new Date(2026, 9, 29, 22, 0)))
  assert.ok(!dayOver(status(undefined), new Date(2026, 9, 29, 21, 59)))
  // a zero target never counts as reached; a bad window end never closes
  assert.ok(!dayOver(status(undefined, [], { targetMin: 0, window: ["09:00", "late"] }), new Date(2026, 9, 29, 23, 0)))
})

test("put keeps one note per task and one day note, newest first", () => {
  let list: Bridge[] = []
  list = put(list, note({ text: "a" }))
  list = put(list, note({ taskId: 2, text: "b" }))
  list = put(list, note({ text: "c" }))
  list = put(list, note({ kind: "day", taskId: null, text: "d1" }))
  list = put(list, note({ kind: "day", taskId: null, text: "d2" }))
  assert.deepEqual(list.map((b) => b.text), ["d2", "c", "b"])
  assert.equal(noteFor(list, 1)?.text, "c")
  assert.equal(noteFor(list, 9), null)
})

test("morningNote is last night's unseen day note, not today's", () => {
  const last = note({ kind: "day", taskId: null, at: "2026-10-28T21:30:00" })
  assert.equal(morningNote([last], "2026-10-29"), last)
  assert.equal(morningNote([{ ...last, seen: true }], "2026-10-29"), null)
  assert.equal(morningNote([{ ...last, at: "2026-10-29T07:00:00" }], "2026-10-29"), null)
  assert.equal(morningNote([note({ at: "2026-10-28T21:30:00" })], "2026-10-29"), null)
})

test("written keeps the whole line, stem included, only when something was added", () => {
  assert.equal(written("Next, I redo the blurt  ", STEM.task), "Next, I redo the blurt")
  assert.equal(written(STEM.task, STEM.task), "")
  assert.equal(written("Next, I", STEM.task), "")
  // backspaced into the stem: what's left of it is still nothing written
  assert.equal(written("Next, ", STEM.task), "")
  assert.equal(written("", STEM.task), "")
  // rewrote the stem itself
  assert.equal(written("Next, fix it", STEM.task), "Next, fix it")
  assert.equal(written("Tomorrow, first I read ch. 4", STEM.day), "Tomorrow, first I read ch. 4")
})

test("shown is the newest task note, or last night's day note when that's newer", () => {
  const today = "2026-10-29"
  const a = note({ taskId: 2, at: "2026-10-29T11:00:00" })
  const b = note({ at: "2026-10-29T10:00:00" })
  const night = note({ kind: "day", taskId: null, at: "2026-10-28T21:30:00" })
  assert.equal(shown([a, b, night], status(undefined), today), a)
  assert.equal(shown([night, b], status(undefined), today), night)
  // today's day note waits for tomorrow; the task note under it still shows
  assert.equal(shown([note({ kind: "day", taskId: null, at: "2026-10-29T21:00:00" }), b], status(undefined), today), b)
  assert.equal(shown([], status(undefined), today), null)
  assert.equal(shown([b], null, today), b)
})

test("shown: a newer pause replaces the older note, even once it's seen", () => {
  const today = "2026-10-29"
  const old = note({ taskId: 2, at: "2026-10-29T09:00:00" })
  assert.equal(shown([note({ seen: true }), old], status(undefined), today), null)
})

test("shown hides a note while its task is active or done, not while another task runs", () => {
  const today = "2026-10-29"
  const b = note({})
  assert.equal(shown([b], status(1), today), null)
  assert.equal(shown([b], status(undefined, [task(1, true)]), today), null)
  assert.equal(shown([b], status(2), today), b)
})

test("retire marks a note seen when its task turns active or done", () => {
  const b = note({})
  const c = note({ taskId: 2 })
  assert.deepEqual(retire([b, c], status(undefined), status(1)).map((x) => x.seen), [true, false])
  assert.deepEqual(retire([b, c], status(undefined), status(undefined, [task(1), task(2, true)])).map((x) => x.seen), [false, true])
  // first status after startup counts as a change
  assert.deepEqual(retire([b], null, status(1)).map((x) => x.seen), [true])
})

test("retire leaves the list alone when no task turned", () => {
  const list = [note({}), note({ kind: "day", taskId: null })]
  assert.equal(retire(list, status(undefined), status(2)), list)
  assert.equal(retire(list, status(1), status(1)), list)
  assert.equal(retire([note({ seen: true })].concat(list.slice(1)), status(undefined), status(1)).length, 2)
})

test("markSeenIn flags only that note", () => {
  const a = note({})
  const b = note({ taskId: 2 })
  const out = markSeenIn([a, b], b)
  assert.deepEqual(out.map((x) => x.seen), [false, true])
  assert.equal(a.seen, false)
})

test("prune drops notes older than three days", () => {
  const now = new Date(2026, 9, 29, 12, 0)
  const keep = note({ at: new Date(2026, 9, 27, 12, 0).toISOString() })
  const drop = note({ taskId: 2, at: new Date(2026, 9, 26, 11, 0).toISOString() })
  assert.deepEqual(prune([keep, drop], now), [keep])
})

test("dayOf is the local date", () => {
  assert.equal(dayOf(new Date(2026, 0, 2, 23, 59)), "2026-01-02")
})

test("parseBridges round-trips and sorts newest first", () => {
  const a = note({ at: "2026-10-28T10:00:00" })
  const b = note({ kind: "day", taskId: null, at: "2026-10-29T10:00:00", seen: true })
  assert.deepEqual(parseBridges(serialize([a, b])), [b, a])
})

test("parseBridges gives [] for a corrupt file and drops bad entries", () => {
  assert.deepEqual(parseBridges(""), [])
  assert.deepEqual(parseBridges("{nope"), [])
  assert.deepEqual(parseBridges("{}"), [])
  const good = note({})
  const out = parseBridges(
    JSON.stringify([
      good,
      { ...good, text: "  " },
      { ...good, at: "yesterday" },
      { ...good, kind: "task", taskId: null },
      { ...good, kind: "week" },
      null,
      "x",
    ]),
  )
  assert.deepEqual(out, [good])
})

test("parseBridges defaults a missing or bad pickup to empty", () => {
  const { pickup, ...old } = note({})
  assert.deepEqual(parseBridges(JSON.stringify([old, { ...old, taskId: 2, pickup: 7 }])).map((b) => b.pickup), ["", ""])
  assert.equal(parseBridges(serialize([note({ pickup: "because" })]))[0].pickup, "because")
})

test("parseBridges keeps a pickup-only bridge, drops one with neither line", () => {
  const only = note({ text: "", pickup: "the retry loop" })
  assert.deepEqual(parseBridges(serialize([only])), [only])
  assert.deepEqual(parseBridges(serialize([note({ text: "", pickup: " " })])), [])
})

import { test } from "node:test"
import assert from "node:assert/strict"
import { countsByDay, dayLabel, isOverdue, localDay, parseTasks, shiftWeek, tasksForDay, weekOf, type AsanaTask } from "./asanaModel.ts"

const t = (over: Partial<AsanaTask> & { gid: string }): AsanaTask => ({
  name: over.gid,
  dueOn: null,
  dueAt: null,
  completed: false,
  url: "",
  project: null,
  ...over,
})

test("parseTasks reads a page and its next offset", () => {
  const page = parseTasks(
    JSON.stringify({
      data: [
        { gid: "1", name: "Ship it", due_on: "2026-11-14", due_at: null, completed: false, permalink_url: "https://a/1", projects: [{ name: "Work" }] },
        { gid: "2", name: "Call", due_at: "2026-11-14T15:00:00.000Z", completed: true },
      ],
      next_page: { offset: "abc" },
    }),
  )
  assert.ok(page)
  assert.equal(page.next, "abc")
  assert.deepEqual(page.tasks[0], { gid: "1", name: "Ship it", dueOn: "2026-11-14", dueAt: null, completed: false, url: "https://a/1", project: "Work" })
  assert.equal(page.tasks[1].completed, true)
  assert.equal(page.tasks[1].project, null)
  assert.equal(page.tasks[1].url, "https://app.asana.com/0/0/2")
})

test("parseTasks drops malformed rows and rejects non-pages", () => {
  const page = parseTasks(JSON.stringify({ data: [{ gid: 3 }, null, { gid: "4", name: "", due_on: "soon" }], next_page: null }))
  assert.ok(page)
  assert.equal(page.next, null)
  assert.equal(page.tasks.length, 1)
  assert.equal(page.tasks[0].name, "Untitled task")
  assert.equal(page.tasks[0].dueOn, null)
  assert.equal(parseTasks("not json"), null)
  assert.equal(parseTasks(JSON.stringify({ errors: [{ message: "Not Authorized" }] })), null)
})

test("localDay puts a timed deadline on its local date", () => {
  const d = new Date(2026, 10, 14, 23, 30) // 23:30 local on the 14th
  assert.equal(localDay(t({ gid: "a", dueOn: "2026-11-15", dueAt: d.toISOString() })), "2026-11-14")
  assert.equal(localDay(t({ gid: "b", dueOn: "2026-11-15" })), "2026-11-15")
  assert.equal(localDay(t({ gid: "c" })), null)
})

test("tasksForDay rolls open overdue tasks onto today only", () => {
  const tasks = [
    t({ gid: "late", dueOn: "2026-11-10" }),
    t({ gid: "lateDone", dueOn: "2026-11-10", completed: true }),
    t({ gid: "today", dueOn: "2026-11-14" }),
    t({ gid: "tomorrow", dueOn: "2026-11-15" }),
    t({ gid: "none" }),
  ]
  assert.deepEqual(tasksForDay(tasks, "2026-11-14", "2026-11-14").map((x) => x.gid), ["late", "today"])
  assert.deepEqual(tasksForDay(tasks, "2026-11-10", "2026-11-14").map((x) => x.gid), ["late", "lateDone"])
  assert.deepEqual(tasksForDay(tasks, "2026-11-15", "2026-11-14").map((x) => x.gid), ["tomorrow"])
  assert.equal(isOverdue(tasks[0], "2026-11-14"), true)
  assert.equal(isOverdue(tasks[1], "2026-11-14"), false)
})

test("tasksForDay orders open before done, then by time, then by name", () => {
  const at = (h: number) => new Date(2026, 10, 14, h).toISOString()
  const tasks = [
    t({ gid: "done", name: "A", dueOn: "2026-11-14", completed: true }),
    t({ gid: "untimed", name: "B", dueOn: "2026-11-14" }),
    t({ gid: "late", name: "Z", dueAt: at(16) }),
    t({ gid: "early", name: "Y", dueAt: at(9) }),
    t({ gid: "untimed2", name: "A", dueOn: "2026-11-14" }),
  ]
  assert.deepEqual(tasksForDay(tasks, "2026-11-14", "2026-11-01").map((x) => x.gid), ["early", "late", "untimed2", "untimed", "done"])
})

test("countsByDay counts open tasks per day", () => {
  const week = weekOf("2026-11-14")
  const tasks = [t({ gid: "1", dueOn: "2026-11-09" }), t({ gid: "2", dueOn: "2026-11-09" }), t({ gid: "3", dueOn: "2026-11-15", completed: true })]
  assert.deepEqual(countsByDay(tasks, week), [2, 0, 0, 0, 0, 0, 0])
})

test("weekOf is Monday first across month, year and DST boundaries", () => {
  assert.deepEqual(weekOf("2026-11-14"), ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"])
  assert.equal(weekOf("2026-11-09")[0], "2026-11-09") // a Monday is its own week's start
  assert.equal(weekOf("2026-11-15")[0], "2026-11-09") // Sunday belongs to the week before
  assert.deepEqual(weekOf("2027-01-01").slice(0, 4), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31"])
  assert.equal(weekOf("2026-10-25")[0], "2026-10-19") // EU clocks change that Sunday
  assert.equal(shiftWeek("2026-12-30", 1), "2027-01-06")
  assert.equal(shiftWeek("2026-11-14", -1), "2026-11-07")
})

test("dayLabel reads naturally", () => {
  assert.equal(dayLabel("2026-11-14", "2026-11-14"), "Today")
  assert.equal(dayLabel("2026-11-15", "2026-11-14"), "Tomorrow")
  assert.equal(dayLabel("2026-11-13", "2026-11-14"), "Yesterday")
  assert.equal(dayLabel("2026-11-19", "2026-11-14"), "Thu 19 Nov")
})

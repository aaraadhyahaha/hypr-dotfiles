import { test } from "node:test"
import assert from "node:assert/strict"
import { slots } from "./wsSlots.ts"

const ids = (s: { id: number }[]) => s.map((x) => x.id)

test("always shows at least five slots, only the focused one active", () => {
  const s = slots([], 1, new Set())
  assert.deepEqual(ids(s), [1, 2, 3, 4, 5])
  assert.deepEqual(s.filter((x) => x.active).map((x) => x.id), [1])
})

test("grows to the highest existing workspace", () => {
  const s = slots([{ id: 7, clients: 1 }], 7, new Set())
  assert.deepEqual(ids(s), [1, 2, 3, 4, 5, 6, 7])
  assert.equal(s[6].active, true)
  assert.equal(s[6].occupied, true)
})

test("grows to the focused workspace even before it reports clients", () => {
  assert.deepEqual(ids(slots([], 6, new Set())), [1, 2, 3, 4, 5, 6])
})

test("special workspaces (negative ids) never become slots", () => {
  assert.deepEqual(ids(slots([{ id: -98, clients: 2 }], 1, new Set())), [1, 2, 3, 4, 5])
})

test("a workspace with no clients is not occupied", () => {
  const s = slots([{ id: 2, clients: 0 }, { id: 3, clients: 4 }], 1, new Set())
  assert.equal(s[1].occupied, false)
  assert.equal(s[2].occupied, true)
})

test("urgent comes from the urgent set", () => {
  const s = slots([], 1, new Set([3]))
  assert.equal(s[2].urgent, true)
  assert.equal(s[0].urgent, false)
})

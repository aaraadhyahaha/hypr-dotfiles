import { test } from "node:test"
import assert from "node:assert/strict"
import { CATALOG, CATEGORIES, DEFAULT_LAYOUT, entry, search, sizesOf } from "./catalog.ts"
import { fits, gridFor, SIZES } from "./layout.ts"

test("every kind is unique", () => {
  const kinds = CATALOG.map((e) => e.kind)
  assert.equal(new Set(kinds).size, kinds.length)
})

test("every default size is one the kind supports, and sizes are known and in order", () => {
  for (const e of CATALOG) {
    assert.ok(e.sizes.includes(e.defaultSize), e.kind)
    assert.deepEqual(
      e.sizes,
      SIZES.filter((s) => e.sizes.includes(s)),
      `${e.kind} sizes in S..XL order`,
    )
  }
})

test("every kind belongs to a listed category", () => {
  const cats = new Set(CATEGORIES.map((c) => c.id))
  for (const e of CATALOG) assert.ok(cats.has(e.category), e.kind)
})

test("the plan's v1 widgets are all there", () => {
  for (const k of ["fx-today", "fx-tasks", "clock", "calendar", "system", "note", "goal", "countdown"])
    assert.ok(entry(k), k)
})

test("sizesOf answers unknown kinds with undefined", () => {
  assert.deepEqual(sizesOf("clock"), entry("clock")!.sizes)
  assert.equal(sizesOf("nope"), undefined)
})

test("the default layout fits this screen's grid without overlaps", () => {
  const grid = gridFor(1536, 816)
  DEFAULT_LAYOUT.forEach((it, i) => {
    assert.ok(sizesOf(it.kind)?.includes(it.size), it.id)
    assert.ok(fits(DEFAULT_LAYOUT.slice(0, i), it, grid), it.id)
  })
})

test("search matches name or description, ignoring case", () => {
  assert.deepEqual(search("CLOCK").map((e) => e.kind), ["clock"])
  assert.ok(search("days until").some((e) => e.kind === "countdown"))
  assert.equal(search("").length, CATALOG.length)
})

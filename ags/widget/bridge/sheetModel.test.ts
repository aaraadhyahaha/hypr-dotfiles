import { test } from "node:test"
import assert from "node:assert/strict"
import { STEM } from "../../service/bridgeModel.ts"
import { OPEN, step, type Sheet } from "./sheetModel.ts"

const lines = (line: string, pickup = "") => ({ line, pickup, stem: STEM.task })
const armed: Sheet = { focus: 1, hint: "armed" }

test("Enter with only the stem is refused and nudges line 1", () => {
  assert.deepEqual(step(OPEN, "enter", lines(STEM.task)), { sheet: { focus: 1, hint: "nudge" }, effect: "nudge" })
  assert.equal(step(OPEN, "enter", lines("Next,")).effect, "nudge")
  assert.equal(step(OPEN, "enter", lines("")).effect, "nudge")
  assert.equal(step({ focus: 2, hint: "idle" }, "enter", lines(STEM.task, "the loop")).sheet.focus, 1)
})

test("Enter with text beyond the stem saves, from either line", () => {
  assert.equal(step(OPEN, "enter", lines("Next, I fix the parser")).effect, "save")
  assert.equal(step({ focus: 2, hint: "idle" }, "enter", lines("Next, I fix the parser")).effect, "save")
  assert.equal(step(OPEN, "enter", { line: "Tomorrow, first I call", pickup: "", stem: STEM.day }).effect, "save")
})

test("Tab swaps lines and keeps the hint", () => {
  assert.deepEqual(step(OPEN, "tab", lines(STEM.task)), { sheet: { focus: 2, hint: "idle" }, effect: "swap" })
  assert.deepEqual(step({ focus: 2, hint: "armed" }, "tab", lines(STEM.task)), { sheet: armed, effect: "swap" })
})

test("one Esc arms the skip without closing", () => {
  assert.deepEqual(step(OPEN, "esc", lines("Next, I fix it")), { sheet: armed, effect: null })
  assert.equal(step({ focus: 1, hint: "nudge" }, "esc", lines(STEM.task)).sheet.hint, "armed")
})

test("Esc Esc saves text beyond the stem", () => {
  const first = step(OPEN, "esc", lines("Next, I fix it")).sheet
  assert.deepEqual(step(first, "esc", lines("Next, I fix it")), { sheet: { focus: 1, hint: "idle" }, effect: "skip-save" })
})

test("Esc Esc with only the stem saves nothing", () => {
  assert.equal(step(armed, "esc", lines(STEM.task)).effect, "close")
  assert.equal(step(armed, "esc", lines("Next, I")).effect, "close")
  assert.equal(step(armed, "esc", lines(STEM.task, "  ")).effect, "close")
})

test("Esc Esc keeps a pickup line on its own", () => {
  assert.equal(step(armed, "esc", lines(STEM.task, "half a thought")).effect, "skip-save")
})

test("the armed state resets on timeout and on typing", () => {
  assert.deepEqual(step(armed, "timeout", lines(STEM.task)), { sheet: OPEN, effect: null })
  assert.deepEqual(step(armed, "type", lines("Next, I w")), { sheet: OPEN, effect: null })
  // so the next Esc only arms again
  const reset = step(armed, "type", lines("Next, I w")).sheet
  assert.equal(step(reset, "esc", lines("Next, I w")).effect, null)
})

test("typing clears the nudge hint; idle stays the same object", () => {
  assert.deepEqual(step({ focus: 1, hint: "nudge" }, "type", lines("Next, I a")).sheet, OPEN)
  assert.equal(step(OPEN, "type", lines("Next, I a")).sheet, OPEN)
})

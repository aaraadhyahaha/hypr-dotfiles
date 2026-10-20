import { test } from "node:test"
import assert from "node:assert/strict"
import { ledEvents, type Leds } from "./model.ts"

const leds = (caps: boolean | null, kbd: number | null, kbdMax: number | null = 3): Leds => ({
  caps,
  kbd,
  kbdMax,
})

test("caps lock turning on emits a caps event", () => {
  assert.deepEqual(ledEvents(leds(false, 0), leds(true, 0)), [{ kind: "caps", on: true }])
})

test("caps lock turning off emits a caps event", () => {
  assert.deepEqual(ledEvents(leds(true, 0), leds(false, 0)), [{ kind: "caps", on: false }])
})

test("keyboard backlight change emits a fraction of max", () => {
  assert.deepEqual(ledEvents(leds(false, 1), leds(false, 2)), [{ kind: "kbd", value: 2 / 3 }])
})

test("unchanged readings emit nothing", () => {
  assert.deepEqual(ledEvents(leds(true, 2), leds(true, 2)), [])
})

test("a missing reading on either side emits nothing for that field", () => {
  assert.deepEqual(ledEvents(leds(null, null), leds(true, 2)), [])
  assert.deepEqual(ledEvents(leds(true, 2), leds(null, null)), [])
})

test("a missing or zero max never divides", () => {
  assert.deepEqual(ledEvents(leds(false, 1, null), leds(false, 2, null)), [])
  assert.deepEqual(ledEvents(leds(false, 1, 0), leds(false, 2, 0)), [])
})

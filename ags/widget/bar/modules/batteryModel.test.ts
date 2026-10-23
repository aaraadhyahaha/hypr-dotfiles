import { test } from "node:test"
import assert from "node:assert/strict"
import { batteryStatus, dur, health, watts } from "./batteryModel.ts"

const base = { charging: false, full: false, discharging: true, toEmpty: 0, toFull: 0 }

test("dur drops the hours under an hour", () => {
  assert.equal(dur(3 * 3600 + 12 * 60), "3 h 12 min")
  assert.equal(dur(45 * 60), "45 min")
})

test("batteryStatus: time left while discharging, nothing when upower has no estimate", () => {
  assert.equal(batteryStatus({ ...base, toEmpty: 11520 }), "3 h 12 min left")
  assert.equal(batteryStatus(base), "")
})

test("batteryStatus: charging, full and the plugged-in hold", () => {
  assert.equal(batteryStatus({ ...base, charging: true, discharging: false, toFull: 2700 }), "45 min to full")
  assert.equal(batteryStatus({ ...base, charging: true, discharging: false }), "Charging")
  assert.equal(batteryStatus({ ...base, full: true, discharging: false }), "Fully charged")
  // held at a charge limit: upower still reports a bogus time to empty
  assert.equal(batteryStatus({ ...base, discharging: false, toEmpty: 999 }), "Plugged in")
})

test("health reads capacity as a fraction or a percentage, cycles only when known", () => {
  assert.equal(health(0.94, 412), "Health 94% · 412 cycles")
  assert.equal(health(55.36, 0), "Health 55%")
  assert.equal(health(0, 0), "")
})

test("watts hides an idle rate", () => {
  assert.equal(watts(11.83), "11.8 W")
  assert.equal(watts(0), "")
  assert.equal(watts(0.01), "")
})

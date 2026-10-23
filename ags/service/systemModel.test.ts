import { test } from "node:test"
import assert from "node:assert/strict"
import { cpuSample, cpuUsage, memUsage, memUsedGb, tempFraction } from "./systemModel.ts"

test("cpuSample sums the first eight counters and counts iowait as idle", () => {
  assert.deepEqual(cpuSample("cpu  100 0 50 800 50 0 0 0 9 9\ncpu0 1 2 3"), { total: 1000, idle: 850 })
  assert.deepEqual(cpuSample(""), { total: 0, idle: 0 })
})

test("cpuUsage is the busy share between two samples", () => {
  assert.equal(cpuUsage({ total: 1000, idle: 850 }, { total: 1100, idle: 900 }), 0.5)
})

test("cpuUsage is 0 for the first sample or a counter that didn't move", () => {
  assert.equal(cpuUsage({ total: 0, idle: 0 }, { total: 1000, idle: 850 }), 0)
  assert.equal(cpuUsage({ total: 1000, idle: 850 }, { total: 1000, idle: 850 }), 0)
})

test("memUsage matches free's used/total (total minus available)", () => {
  const meminfo = "MemTotal:       16000000 kB\nMemFree:         2000000 kB\nMemAvailable:    4000000 kB\n"
  assert.equal(memUsage(meminfo), 0.75)
  assert.equal(memUsage(""), 0)
})

test("memUsedGb is total minus available in GiB, one decimal", () => {
  const meminfo = "MemTotal:       16777216 kB\nMemAvailable:   11534336 kB\n"
  assert.equal(memUsedGb(meminfo), "5.0G")
  assert.equal(memUsedGb(""), "0.0G")
})

test("tempFraction takes the hottest zone, with 100°C as 1", () => {
  assert.equal(tempFraction(["45000\n", "62500\n", "bad"]), 0.625)
  assert.equal(tempFraction([]), 0)
})

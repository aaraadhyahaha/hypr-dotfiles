import { test } from "node:test"
import assert from "node:assert/strict"
import {
  cpuName,
  cpuSample,
  cpuUsage,
  fmtBytes,
  memUsage,
  memUsedGb,
  procStat,
  sparkHeights,
  tempFraction,
  topProcs,
} from "./systemModel.ts"

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

test("procStat reads comm (spaces and parens included), cpu ticks and rss bytes", () => {
  const line = "42 (Web (Content) x) S 1 2 3 0 -1 0 0 0 0 0 150 50 0 0 20 0 1 0 100 6356992 969 0"
  assert.deepEqual(procStat(line), { comm: "Web (Content) x", ticks: 200, rss: 969 * 4096 })
  assert.equal(procStat("garbage"), null)
})

test("topProcs groups by name, ranks by cpu share since the last sample, skips new pids", () => {
  const prev = new Map([[1, 100], [2, 50], [3, 10]])
  const cur = [
    { pid: 1, comm: "firefox", ticks: 130, rss: 1e9 },
    { pid: 2, comm: "firefox", ticks: 60, rss: 5e8 },
    { pid: 3, comm: "kitty", ticks: 15, rss: 2e8 },
    { pid: 4, comm: "new", ticks: 999, rss: 1 },
  ]
  assert.deepEqual(topProcs(prev, cur, 1000, 2), [
    { name: "firefox", cpu: 0.04, rss: 1.5e9 },
    { name: "kitty", cpu: 0.005, rss: 2e8 },
  ])
})

test("fmtBytes switches from M to G at a GiB", () => {
  assert.equal(fmtBytes(210 * 1024 ** 2), "210 M")
  assert.equal(fmtBytes(1.8 * 1024 ** 3), "1.8 G")
})

test("cpuName keeps the model, drops vendor marks and clocks", () => {
  assert.equal(cpuName("11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz"), "Core i5-1135G7")
  assert.equal(cpuName("AMD Ryzen 7 7840U w/ Radeon 780M Graphics"), "Ryzen 7 7840U")
  assert.equal(cpuName("AMD Ryzen 5 5600X 6-Core Processor"), "Ryzen 5 5600X")
})

test("sparkHeights stretches a flat window around its value and keeps a floor", () => {
  assert.deepEqual(sparkHeights([0.5, 0.5], 36, 0.1, 0.1), [20, 20])
  const h = sparkHeights([0, 0.5, 1], 36, 0.1, 0.1)
  assert.deepEqual(h, [4, 20, 36])
})

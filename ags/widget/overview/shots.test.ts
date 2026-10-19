import { test } from "node:test"
import assert from "node:assert/strict"
import { addr, parseClients, captureTargets, mergeShots, type WinInfo } from "./shots.ts"

const win = (o: Partial<WinInfo>): WinInfo => ({
  address: "0x1", ws: 1, x: 0, y: 0, w: 800, h: 600,
  fullscreen: 0, hidden: false, mapped: true, ...o,
})

test("addr adds a missing 0x prefix only", () => {
  assert.equal(addr("abc"), "0xabc")
  assert.equal(addr("0xabc"), "0xabc")
})

test("parseClients maps hyprctl JSON", () => {
  const json = JSON.stringify([{
    address: "abc", at: [10, 20], size: [800, 600],
    workspace: { id: 2, name: "2" }, fullscreen: 0, hidden: false, mapped: true,
  }])
  assert.deepEqual(parseClients(json), [
    { address: "0xabc", ws: 2, x: 10, y: 20, w: 800, h: 600, fullscreen: 0, hidden: false, mapped: true },
  ])
})

test("parseClients returns [] on garbage", () => {
  assert.deepEqual(parseClients("not json"), [])
})

test("captureTargets keeps visible, mapped, sized windows on the workspace", () => {
  const list = [
    win({ address: "0xa" }),
    win({ address: "0xb", ws: 2 }),
    win({ address: "0xc", hidden: true }),
    win({ address: "0xd", mapped: false }),
    win({ address: "0xe", w: 0 }),
  ]
  assert.deepEqual(captureTargets(list, 1).map((i) => i.address), ["0xa"])
})

test("captureTargets captures only the fullscreen window when one exists", () => {
  const list = [win({ address: "0xa" }), win({ address: "0xb", fullscreen: 2 })]
  assert.deepEqual(captureTargets(list, 1).map((i) => i.address), ["0xb"])
})

test("mergeShots overlays fresh shots, keeps other live ones, and reports replaced and dead files", () => {
  const prev = { "0xa": "/s/a-1.png", "0xb": "/s/b-1.png", "0xc": "/s/c-1.png" }
  const fresh = { "0xa": "/s/a-2.png" }
  const { shots, stale } = mergeShots(prev, fresh, new Set(["0xa", "0xb"]))
  assert.deepEqual(shots, { "0xa": "/s/a-2.png", "0xb": "/s/b-1.png" })
  assert.deepEqual([...stale].sort(), ["/s/a-1.png", "/s/c-1.png"])
})

test("mergeShots never reports a path that is still in use", () => {
  const prev = { "0xa": "/s/a-1.png" }
  const { stale } = mergeShots(prev, { "0xa": "/s/a-1.png" }, new Set(["0xa"]))
  assert.deepEqual(stale, [])
})

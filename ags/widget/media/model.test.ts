import { test } from "node:test"
import assert from "node:assert/strict"
import { fmtTime, pickPlayer } from "./model.ts"

test("fmtTime: minutes and zero-padded seconds", () => {
  assert.equal(fmtTime(187), "3:07")
  assert.equal(fmtTime(0), "0:00")
  assert.equal(fmtTime(59.9), "0:59")
})

test("fmtTime: hours once past an hour", () => {
  assert.equal(fmtTime(3723), "1:02:03")
})

test("fmtTime: negative or non-finite is 0:00", () => {
  assert.equal(fmtTime(-1), "0:00")
  assert.equal(fmtTime(NaN), "0:00")
  assert.equal(fmtTime(Infinity), "0:00")
})

const PLAYING = 0
const PAUSED = 1
const p = (busName: string, playbackStatus: number) => ({ busName, playbackStatus })

test("pickPlayer: no players gives null", () => {
  assert.equal(pickPlayer([]), null)
})

test("pickPlayer: the preferred player wins while it exists", () => {
  const a = p("a", PAUSED)
  const b = p("b", PLAYING)
  assert.equal(pickPlayer([a, b], "a"), a)
})

test("pickPlayer: falls back to the playing one when the preferred player is gone", () => {
  const b = p("b", PAUSED)
  const c = p("c", PLAYING)
  assert.equal(pickPlayer([b, c], "a"), c)
})

test("pickPlayer: nothing playing gives the first player", () => {
  const a = p("a", PAUSED)
  assert.equal(pickPlayer([a, p("b", PAUSED)]), a)
})

test("pickPlayer: with nothing playing, stays on the last shown player", () => {
  const a = p("a", PAUSED)
  const b = p("b", PAUSED)
  assert.equal(pickPlayer([a, b], undefined, "b"), b)
})

test("pickPlayer: a playing player still beats the last shown one", () => {
  const a = p("a", PLAYING)
  const b = p("b", PAUSED)
  assert.equal(pickPlayer([a, b], undefined, "b"), a)
})

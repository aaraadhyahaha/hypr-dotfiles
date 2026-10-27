import { test } from "node:test"
import assert from "node:assert/strict"
import { classify, summarize, type Stream } from "./privacyModel.ts"

const mic = (app: string, binary?: string): Stream => ({ app, binary, media: "audio" })
const cam = (app: string): Stream => ({ app, media: "video", source: { role: "Camera", api: "v4l2" } })
const share = (app: string): Stream => ({ app, media: "video", source: { api: "xdph" } })

test("classify maps audio to mic and video by its source", () => {
  assert.equal(classify(mic("Firefox")), "mic")
  assert.equal(classify(cam("Firefox")), "camera")
  assert.equal(classify(share("Firefox")), "screen")
})

test("classify spots a camera from either role or api", () => {
  assert.equal(classify({ app: "a", media: "video", source: { role: "camera" } }), "camera")
  assert.equal(classify({ app: "a", media: "video", source: { api: "v4l2" } }), "camera")
  assert.equal(classify({ app: "a", media: "video", source: { api: "libcamera" } }), "camera")
})

test("classify treats a video stream with no known source as the screen", () => {
  assert.equal(classify({ app: "Chromium", media: "video" }), "screen")
  assert.equal(classify({ app: "Chromium", media: "video", source: null }), "screen")
})

test("classify ignores our own meters by app or binary, any case", () => {
  assert.equal(classify(mic("cava")), null)
  assert.equal(classify(mic("PulseAudio Volume Control", "pavucontrol")), null)
  assert.equal(classify(mic("GJS")), null)
  assert.equal(classify(mic("wf-recorder")), null)
})

test("summarize with nothing capturing is hidden", () => {
  const p = summarize([])
  assert.equal(p.level, "none")
  assert.deepEqual(p.apps, [])
  assert.equal(p.mic || p.camera || p.screen, false)
})

test("summarize with only ignored streams is hidden", () => {
  assert.equal(summarize([mic("cava"), mic("easyeffects")]).level, "none")
})

test("summarize merges one app's streams and dedupes", () => {
  const p = summarize([mic("Firefox"), mic("Firefox"), cam("Firefox")])
  assert.deepEqual(p.apps, [{ app: "Firefox", kinds: ["camera", "mic"] }])
  assert.equal(p.level, "camera")
})

test("summarize level prefers screen over camera over mic", () => {
  assert.equal(summarize([mic("a")]).level, "mic")
  assert.equal(summarize([mic("a"), cam("b")]).level, "camera")
  assert.equal(summarize([mic("a"), cam("b"), share("c")]).level, "screen")
})

test("summarize sorts apps by their most sensitive use, then name", () => {
  const p = summarize([mic("Zoom"), mic("Discord"), share("OBS"), cam("Cheese")])
  assert.deepEqual(p.apps.map((a) => a.app), ["OBS", "Cheese", "Discord", "Zoom"])
})

test("summarize reports a muted mic only while a mic stream is open", () => {
  assert.equal(summarize([mic("Discord")], true).micMuted, true)
  assert.equal(summarize([mic("Discord")], false).micMuted, false)
  assert.equal(summarize([cam("Cheese")], true).micMuted, false)
})

test("summarize names a stream without app name by its binary", () => {
  assert.deepEqual(summarize([{ app: "", binary: "arecord", media: "audio" }]).apps, [
    { app: "arecord", kinds: ["mic"] },
  ])
})

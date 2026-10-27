import { test } from "node:test"
import assert from "node:assert/strict"
import { classify, guessSource, isCamera, samePrivacy, summarize, type Stream } from "./privacyModel.ts"

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

test("summarize reports a muted mic only when every open mic stream is muted", () => {
  const muted = { ...mic("Discord"), muted: true }
  assert.equal(summarize([muted]).micMuted, true)
  assert.equal(summarize([mic("Discord")]).micMuted, false)
  assert.equal(summarize([muted, mic("Zoom")]).micMuted, false) // Zoom's mic is live
  assert.equal(summarize([cam("Cheese")]).micMuted, false)
})

test("summarize names a stream without app name by its binary", () => {
  assert.deepEqual(summarize([{ app: "", binary: "arecord", media: "audio" }]).apps, [
    { app: "arecord", kinds: ["mic"] },
  ])
})

test("classify leaves out the shell's own streams by pid, but not other GJS apps", () => {
  assert.equal(classify({ ...mic("gjs", "gjs"), pid: 42 }, 42), null)
  assert.equal(classify({ ...mic("Sound Recorder", "gjs"), pid: 7 }, 42), "mic")
})

test("classify skips desktop-audio capture", () => {
  assert.equal(classify({ ...mic("OBS"), monitor: true }), null)
  assert.equal(classify({ ...mic("Discord"), monitor: false }), "mic")
})

test("isCamera matches role or api", () => {
  assert.equal(isCamera({ role: "Camera" }), true)
  assert.equal(isCamera({ api: "v4l2" }), true)
  assert.equal(isCamera({}), false)
  assert.equal(isCamera(null), false)
})

test("guessSource picks the camera only when every video source is one", () => {
  const camera = { api: "v4l2", role: "Camera" }
  assert.equal(guessSource([camera]), camera)
  assert.equal(guessSource([camera, { api: "v4l2" }]), camera) // e.g. v4l2loopback
  assert.equal(guessSource([camera, {}]), null) // an xdph screencast node exists
  assert.equal(guessSource([]), null)
})

test("samePrivacy compares by value", () => {
  assert.equal(samePrivacy(summarize([mic("a")]), summarize([mic("a")])), true)
  assert.equal(samePrivacy(summarize([mic("a")]), summarize([mic("b")])), false)
})

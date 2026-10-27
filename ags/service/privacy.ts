import AstalWp from "gi://AstalWp"
import { createState } from "ags"
import { summarize, type Privacy, type Stream } from "./privacyModel"

// What other apps capture (mic / camera / screen) for bar.privacy. Signal-driven off AstalWp:
// recorder/source added/removed, plus per-node state, target and mute changes. No polling.

const wp = AstalWp.get_default()
const audio = wp?.audio
const video = wp?.video

export const [privacy, setPrivacy] = createState<Privacy>(summarize([]))

const pw = (n: AstalWp.Node, key: string) => n.get_pw_property(key) ?? undefined
const sourceOf = (n: AstalWp.Node) => ({ role: pw(n, "media.role"), api: pw(n, "device.api") })
const isCamera = (n: AstalWp.Node) => {
  const s = sourceOf(n)
  return s.role?.toLowerCase() === "camera" || s.api === "v4l2" || s.api === "libcamera"
}

// Portal streams may not set a target, so an unresolved video stream is a camera only when
// a camera is running and nothing else is offering video (no xdph screencast node)
function fallback(sources: AstalWp.Node[]) {
  const cams = sources.filter(isCamera)
  const running = cams.find((c) => c.state === AstalWp.NodeState.RUNNING)
  return running && cams.length === sources.length ? sourceOf(running) : null
}

function stream(s: AstalWp.Stream, media: Stream["media"], sources: AstalWp.Node[], guess: Stream["source"]): Stream {
  const target = s.targetSerial >= 0 ? sources.find((n) => n.serial === s.targetSerial) : undefined
  return {
    app: pw(s, "application.name") ?? s.description ?? s.name ?? "",
    binary: pw(s, "application.process.binary"),
    media,
    source: target ? sourceOf(target) : media === "video" ? guess : null,
  }
}

function update() {
  const sources = video?.sources ?? []
  const guess = fallback(sources)
  const streams = [
    ...(audio?.recorders ?? []).map((s) => stream(s, "audio", [], null)),
    ...(video?.recorders ?? []).map((s) => stream(s, "video", sources, guess)),
  ]
  setPrivacy(summarize(streams, audio?.defaultMicrophone?.mute ?? false))
}

// Per-node handlers, dropped when the node goes away
const handlers = new Map<AstalWp.Node, number[]>()
function watch(n: AstalWp.Node, ...props: string[]) {
  if (handlers.has(n)) return
  handlers.set(n, props.map((p) => n.connect(`notify::${p}`, update)))
}
function unwatch(n: AstalWp.Node) {
  handlers.get(n)?.forEach((id) => n.disconnect(id))
  handlers.delete(n)
}

if (audio && video) {
  const onRecorder = (_: unknown, s: AstalWp.Stream) => (watch(s, "target-serial", "description"), update())
  const onSource = (_: unknown, n: AstalWp.Node) => (watch(n, "state"), update())
  const onGone = (_: unknown, n: AstalWp.Node) => (unwatch(n), update())

  audio.connect("recorder-added", onRecorder)
  audio.connect("recorder-removed", onGone)
  video.connect("recorder-added", onRecorder)
  video.connect("recorder-removed", onGone)
  video.connect("source-added", onSource)
  video.connect("source-removed", onGone)

  // the default mic can change; follow whichever is current
  let mic: AstalWp.Endpoint | null = null
  let micId = 0
  const followMic = () => {
    if (mic) mic.disconnect(micId)
    mic = audio.defaultMicrophone
    micId = mic?.connect("notify::mute", update) ?? 0
    update()
  }
  audio.connect("notify::default-microphone", followMic)

  ;[...audio.recorders, ...video.recorders].forEach((s) => watch(s, "target-serial", "description"))
  video.sources.forEach((n) => watch(n, "state"))
  followMic()
}

export function toggleMicMute() {
  const mic = audio?.defaultMicrophone
  if (mic) mic.mute = !mic.mute
}

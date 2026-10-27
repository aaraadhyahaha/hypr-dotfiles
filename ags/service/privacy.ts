import AstalWp from "gi://AstalWp"
import Gio from "gi://Gio"
import { createState } from "ags"
import { guessSource, samePrivacy, summarize, type Privacy, type Source, type Stream } from "./privacyModel"

// What other apps capture (mic / camera / screen) for bar.privacy. Signal-driven off AstalWp:
// recorder/source/mic added/removed, plus per-node state, target and mute changes. No polling.

const wp = AstalWp.get_default()
const audio = wp?.audio
const video = wp?.video
const ownPid = Gio.Credentials.new().get_unix_pid()

export const [privacy, setPrivacy] = createState<Privacy>(summarize([]))

const pw = (n: AstalWp.Node, key: string) => n.get_pw_property(key) ?? undefined
const running = (n: AstalWp.Node) => n.state === AstalWp.NodeState.RUNNING
const sourceOf = (n: AstalWp.Node): Source => ({
  role: pw(n, "media.role"),
  api: pw(n, "device.api"),
  running: running(n),
})
const bySerial = <T extends AstalWp.Node>(nodes: T[], serial: number) =>
  serial >= 0 ? nodes.find((n) => n.serial === serial) : undefined

function base(s: AstalWp.Stream, media: Stream["media"]): Stream {
  const pid = Number(pw(s, "application.process.id"))
  return {
    app: pw(s, "application.name") ?? s.description ?? s.name ?? "",
    binary: pw(s, "application.process.binary"),
    pid: Number.isInteger(pid) ? pid : undefined,
    media,
    running: running(s),
  }
}

function audioStream(s: AstalWp.Stream, a: AstalWp.Audio): Stream {
  // no target: it records from the default mic
  const mic = s.targetSerial >= 0 ? bySerial(a.microphones, s.targetSerial) : a.defaultMicrophone
  const monitor = pw(s, "stream.capture.sink") === "true" || !!bySerial(a.speakers, s.targetSerial)
  return { ...base(s, "audio"), monitor, muted: mic?.mute ?? false }
}

function videoStream(s: AstalWp.Stream, sources: AstalWp.Node[], guess: Source | null): Stream {
  const target = bySerial(sources, s.targetSerial)
  return { ...base(s, "video"), source: target ? sourceOf(target) : guess }
}

// `gone`: a node whose removed signal is firing, in case AstalWp still lists it
function update(gone?: AstalWp.Node) {
  if (!audio || !video) return
  const live = <T extends AstalWp.Node>(nodes: T[]) => nodes.filter((n) => n !== gone)
  const sources = live(video.sources)
  const guess = guessSource(sources.map(sourceOf))
  const next = summarize(
    [
      ...live(audio.recorders).map((s) => audioStream(s, audio)),
      ...live(video.recorders).map((s) => videoStream(s, sources, guess)),
    ],
    ownPid,
  )
  if (!samePrivacy(privacy.get(), next)) setPrivacy(next)
}

// Per-node handlers, dropped when the node goes away
const handlers = new Map<AstalWp.Node, number[]>()
function watch(n: AstalWp.Node, ...props: string[]) {
  if (handlers.has(n)) return
  handlers.set(n, props.map((p) => n.connect(`notify::${p}`, () => update())))
}
function unwatch(n: AstalWp.Node) {
  handlers.get(n)?.forEach((id) => n.disconnect(id))
  handlers.delete(n)
}

const RECORDER = ["target-serial", "description", "state"]

if (audio && video) {
  const added = (...props: string[]) => (_: unknown, n: AstalWp.Node) => (watch(n, ...props), update())
  const removed = (_: unknown, n: AstalWp.Node) => (unwatch(n), update(n))

  audio.connect("recorder-added", added(...RECORDER))
  audio.connect("recorder-removed", removed)
  audio.connect("microphone-added", added("mute"))
  audio.connect("microphone-removed", removed)
  audio.connect("notify::default-microphone", () => update())
  video.connect("recorder-added", added(...RECORDER))
  video.connect("recorder-removed", removed)
  video.connect("source-added", added("state"))
  video.connect("source-removed", removed)

  ;[...audio.recorders, ...video.recorders].forEach((s) => watch(s, ...RECORDER))
  audio.microphones.forEach((m) => watch(m, "mute"))
  video.sources.forEach((n) => watch(n, "state"))
  update()
}

export function toggleMicMute() {
  const mic = audio?.defaultMicrophone
  if (mic) mic.mute = !mic.mute
}

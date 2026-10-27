import AstalWp from "gi://AstalWp"
import Gio from "gi://Gio"
import { createState } from "ags"
import { guessSource, samePrivacy, summarize, type Privacy, type Source, type Stream } from "./privacyModel"

// What other apps capture (mic / camera / screen) for bar.privacy. Signal-driven off AstalWp:
// recorder/source/mic added/removed, plus per-stream target and per-mic mute changes. No polling.

const wp = AstalWp.get_default()
const audio = wp?.audio
const video = wp?.video
const ownPid = Gio.Credentials.new().get_unix_pid()

export const [privacy, setPrivacy] = createState<Privacy>(summarize([]))

const pw = (n: AstalWp.Node, key: string) => n.get_pw_property(key) ?? undefined
const sourceOf = (n: AstalWp.Node): Source => ({ role: pw(n, "media.role"), api: pw(n, "device.api") })
// The node a stream asked for. AstalWp's `targetSerial` reads 0 when unset and ignores the
// `target.object` prop (a serial or a node.name), which is how most apps and portals target.
function targetOf<T extends AstalWp.Node>(s: AstalWp.Stream, nodes: T[]) {
  const obj = pw(s, "target.object")
  const serial = s.targetSerial > 0 ? s.targetSerial : Number(obj)
  return nodes.find((n) => (serial > 0 && n.serial === serial) || (!!obj && pw(n, "node.name") === obj))
}

function base(s: AstalWp.Stream, media: Stream["media"]): Stream {
  const pid = Number(pw(s, "application.process.id"))
  return {
    app: pw(s, "application.name") ?? s.description ?? s.name ?? "",
    binary: pw(s, "application.process.binary"),
    pid: Number.isInteger(pid) ? pid : undefined,
    media,
  }
}

function audioStream(s: AstalWp.Stream, a: AstalWp.Audio): Stream {
  const monitor = pw(s, "stream.capture.sink") === "true" || !!targetOf(s, a.speakers)
  // no (known) target: it records from the default mic. Read it from `microphones`, whose
  // `mute` notify triggered this; `defaultMicrophone` is a separate object that may lag.
  const mic =
    targetOf(s, a.microphones) ?? a.microphones.find((m) => m.isDefault) ?? a.defaultMicrophone
  return { ...base(s, "audio"), monitor, muted: !monitor && (mic?.mute ?? false) }
}

function videoStream(s: AstalWp.Stream, sources: AstalWp.Node[], guess: Source | null): Stream {
  const target = targetOf(s, sources)
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

const RECORDER = ["target-serial", "description"]

if (audio && video) {
  const added = (...props: string[]) => (_: unknown, n: AstalWp.Node) => (watch(n, ...props), update())
  const removed = (_: unknown, n: AstalWp.Node) => (unwatch(n), update(n))

  audio.connect("recorder-added", added(...RECORDER))
  audio.connect("recorder-removed", removed)
  audio.connect("microphone-added", added("mute", "is-default"))
  audio.connect("microphone-removed", removed)
  audio.connect("notify::default-microphone", () => update())
  video.connect("recorder-added", added(...RECORDER))
  video.connect("recorder-removed", removed)
  video.connect("source-added", added())
  video.connect("source-removed", removed)

  ;[...audio.recorders, ...video.recorders].forEach((s) => watch(s, ...RECORDER))
  audio.microphones.forEach((m) => watch(m, "mute", "is-default"))
  update()
}

export function toggleMicMute() {
  const mic = audio?.defaultMicrophone
  if (mic) mic.mute = !mic.mute
}

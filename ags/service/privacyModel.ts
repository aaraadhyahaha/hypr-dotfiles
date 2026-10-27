// What other apps capture (mic / camera / screen), from PipeWire consumer streams. Pure, so it can be unit tested.

export type Kind = "mic" | "camera" | "screen"
export type Level = Kind | "none"

// A Video/Source node's props (or the one a stream is linked to)
export type Source = { role?: string; api?: string }

// One capturing stream, flattened from an AstalWp node by svc.privacy
export type Stream = {
  app: string // application.name, else the node name
  binary?: string // application.process.binary
  pid?: number // application.process.id
  media: "audio" | "video"
  monitor?: boolean // audio taken from a speaker's monitor (desktop audio), not a mic
  muted?: boolean // the mic it records from is muted
  source?: Source | null // the source node the stream is linked to, when known
}

export type AppUse = { app: string; kinds: Kind[] }

export type Privacy = {
  mic: boolean
  camera: boolean
  screen: boolean
  micMuted: boolean // every open mic stream records from a muted mic
  level: Level
  apps: AppUse[]
}

// Standalone meters/visualisers and effect chains keep a mic stream open all the time.
// wf-recorder is svc.recorder, which bar.recording already shows. The shell itself is
// left out by pid, not by name, so other GJS apps still count.
export const IGNORE = ["cava", "pavucontrol", "easyeffects", "wf-recorder"]

const ORDER: Kind[] = ["screen", "camera", "mic"]

const ignored = (s: Stream) =>
  [s.app, s.binary].some((n) => n && IGNORE.includes(n.toLowerCase()))

export const isCamera = (src?: Source | null) =>
  src?.role?.toLowerCase() === "camera" || src?.api === "v4l2" || src?.api === "libcamera"

// Portal streams may not set a target. Such a stream is a camera only when every video
// source is one, i.e. no xdph screencast node exists. (AstalWp's node `state` never leaves
// CREATING, so whether a source is running can't be told.)
export function guessSource(sources: Source[]): Source | null {
  return sources.length > 0 && sources.every(isCamera) ? sources[0] : null
}

// Video consumers are either a camera (linked to a v4l2/libcamera source) or a screencast
// (linked to a portal/xdph node). Anything not provably a camera counts as the screen,
// the more sensitive of the two.
export function classify(s: Stream, ownPid?: number): Kind | null {
  if (ignored(s) || (ownPid !== undefined && s.pid === ownPid)) return null
  if (s.media === "audio") return s.monitor ? null : "mic"
  return isCamera(s.source) ? "camera" : "screen"
}

export function summarize(streams: Stream[], ownPid?: number): Privacy {
  const byApp = new Map<string, Set<Kind>>()
  const mics: Stream[] = []
  for (const s of streams) {
    const kind = classify(s, ownPid)
    if (!kind) continue
    if (kind === "mic") mics.push(s)
    const app = s.app || s.binary || "Unknown"
    if (!byApp.has(app)) byApp.set(app, new Set())
    byApp.get(app)!.add(kind)
  }

  const apps = [...byApp]
    .map(([app, kinds]) => ({ app, kinds: ORDER.filter((k) => kinds.has(k)) }))
    .sort((a, b) => ORDER.indexOf(a.kinds[0]) - ORDER.indexOf(b.kinds[0]) || a.app.localeCompare(b.app))

  const has = (k: Kind) => apps.some((a) => a.kinds.includes(k))
  return {
    mic: mics.length > 0,
    camera: has("camera"),
    screen: has("screen"),
    micMuted: mics.length > 0 && mics.every((s) => s.muted),
    level: ORDER.find(has) ?? "none",
    apps,
  }
}

export const samePrivacy = (a: Privacy, b: Privacy) => JSON.stringify(a) === JSON.stringify(b)

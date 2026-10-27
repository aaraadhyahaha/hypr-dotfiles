// What other apps capture (mic / camera / screen), from PipeWire consumer streams. Pure, so it can be unit tested.

export type Kind = "mic" | "camera" | "screen"
export type Level = Kind | "none"

// One capturing stream, flattened from an AstalWp node by svc.privacy
export type Stream = {
  app: string // application.name, else the node name
  binary?: string // application.process.binary
  media: "audio" | "video"
  // the source node the stream is linked to, when known
  source?: { role?: string; api?: string } | null
}

export type AppUse = { app: string; kinds: Kind[] }

export type Privacy = {
  mic: boolean
  camera: boolean
  screen: boolean
  micMuted: boolean // a mic stream is open but the default mic is muted
  level: Level
  apps: AppUse[]
}

// Our own meters/visualisers and effect chains keep a mic stream open all the time.
// wf-recorder is svc.recorder, which bar.recording already shows.
export const IGNORE = ["gjs", "ags", "cava", "pavucontrol", "easyeffects", "wf-recorder"]

const ORDER: Kind[] = ["screen", "camera", "mic"]

const ignored = (s: Stream) =>
  [s.app, s.binary].some((n) => n && IGNORE.includes(n.toLowerCase()))

// Video consumers are either a camera (linked to a v4l2/libcamera source) or a screencast
// (linked to a portal/xdph node). Anything not provably a camera counts as the screen,
// the more sensitive of the two.
export function classify(s: Stream): Kind | null {
  if (ignored(s)) return null
  if (s.media === "audio") return "mic"
  const src = s.source
  const camera =
    src?.role?.toLowerCase() === "camera" || src?.api === "v4l2" || src?.api === "libcamera"
  return camera ? "camera" : "screen"
}

export function summarize(streams: Stream[], micMuted = false): Privacy {
  const byApp = new Map<string, Set<Kind>>()
  for (const s of streams) {
    const kind = classify(s)
    if (!kind) continue
    const app = s.app || s.binary || "Unknown"
    if (!byApp.has(app)) byApp.set(app, new Set())
    byApp.get(app)!.add(kind)
  }

  const apps = [...byApp]
    .map(([app, kinds]) => ({ app, kinds: ORDER.filter((k) => kinds.has(k)) }))
    .sort((a, b) => ORDER.indexOf(a.kinds[0]) - ORDER.indexOf(b.kinds[0]) || a.app.localeCompare(b.app))

  const has = (k: Kind) => apps.some((a) => a.kinds.includes(k))
  const mic = has("mic")
  return {
    mic,
    camera: has("camera"),
    screen: has("screen"),
    micMuted: mic && micMuted,
    level: ORDER.find(has) ?? "none",
    apps,
  }
}

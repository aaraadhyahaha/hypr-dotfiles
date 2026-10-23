import { Gtk } from "ags/gtk4"
import { type Accessor, createState } from "ags"
import { execAsync } from "ags/process"
import { timeout } from "ags/time"
import Icon from "../common/Icon"
import { pickRegion, screenshotGeometry } from "./Screenshot"
import { nextTimer, timerLabel, windowGeometry } from "./model"
import { recording, startRecording, stopRecording } from "../../service/recorder"

type Mode = "region" | "window" | "screen"
type Kind = "photo" | "video"

const MODES: { id: Mode; icon: string; label: string }[] = [
  { id: "region", icon: "screenshot_region", label: "Region" },
  { id: "window", icon: "select_window", label: "Window" },
  { id: "screen", icon: "desktop_windows", label: "Screen" },
]

const [mode, setMode] = createState<Mode>("region")
const [kind, setKind] = createState<Kind>("photo")
const [mic, setMic] = createState(false)
const [delay, setDelay] = createState(0)

const wait = (s: number) => new Promise<void>((r) => (s ? timeout(s * 1000, () => r()) : r()))

// where to capture: a geometry, undefined for every output, null when the pick was cancelled
async function target(): Promise<string | null | undefined> {
  switch (mode.get()) {
    case "region":
      return pickRegion()
    case "window":
      return windowGeometry(await execAsync(["hyprctl", "activewindow", "-j"]).catch(() => ""))
    default:
      return undefined
  }
}

async function capture(close: () => void) {
  close()
  if (recording.get()) return stopRecording()
  const geometry = await target()
  if (geometry === null) return
  await wait(delay.get())
  if (kind.get() === "photo") screenshotGeometry(geometry)
  else startRecording({ geometry, audio: mic.get() })
}

function Seg({ on, pick, icon, label, tip }: {
  on: Accessor<boolean>
  pick: () => void
  icon: string
  label?: string
  tip?: string
}) {
  return (
    <button class={on.as((o) => (o ? "tb-seg on" : "tb-seg"))} tooltipText={tip} onClicked={pick}>
      <box spacing={8} halign={Gtk.Align.CENTER}>
        <Icon name={icon} />
        {label && <label label={label} />}
      </box>
    </button>
  )
}

// screenshot / record toolbar (ScreenshotBtn.tsx): mode · photo / video · mic · timer · Capture
export default function Toolbar({ close }: { close: () => void }) {
  return (
    <box class="tb" spacing={6}>
      <box class="tb-group mode">
        {MODES.map((m) => (
          <Seg on={mode.as((v) => v === m.id)} pick={() => setMode(m.id)} icon={m.icon} label={m.label} />
        ))}
      </box>
      <box class="tb-sep" valign={Gtk.Align.CENTER} />
      <box class="tb-group kind">
        <Seg on={kind.as((k) => k === "photo")} pick={() => setKind("photo")} icon="photo_camera" tip="Screenshot" />
        <Seg on={kind.as((k) => k === "video")} pick={() => setKind("video")} icon="videocam" tip="Recording" />
      </box>
      <button
        class={mic.as((m) => (m ? "tb-btn on" : "tb-btn"))}
        tooltipText="Record audio"
        sensitive={kind.as((k) => k === "video")}
        onClicked={() => setMic(!mic.get())}
      >
        <Icon name={mic.as((m) => (m ? "mic" : "mic_off"))} />
      </button>
      <button class="tb-btn timer" tooltipText="Delay" onClicked={() => setDelay(nextTimer(delay.get()))}>
        <box spacing={6}>
          <Icon name={delay.as((d) => (d ? "timer" : "timer_off"))} />
          <label label={delay.as(timerLabel)} />
        </box>
      </button>
      <button class="tb-capture" onClicked={() => capture(close)}>
        <label label={recording.as((r) => (r ? "Stop" : "Capture"))} />
      </button>
    </box>
  )
}

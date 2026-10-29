import { Gtk } from "ags/gtk4"
import { type Accessor, createState } from "ags"
import { timeout } from "ags/time"
import Icon from "../common/Icon"
import { closeShot, screenshotGeometry, shotTarget } from "./Screenshot"
import { type Mode, nextTimer, timerLabel, nextFps, fpsLabel } from "./model"
import { recording, fps, setFps, startRecording, stopRecording } from "../../service/recorder"

type Kind = "photo" | "video"

const MODES: { id: Mode; icon: string; label: string }[] = [
  { id: "region", icon: "screenshot_region", label: "Region" },
  { id: "window", icon: "select_window", label: "Window" },
  { id: "screen", icon: "desktop_windows", label: "Screen" },
]

// read by the session overlay (Screenshot.tsx), which redraws when it changes
export const [mode, setMode] = createState<Mode>("region")
const [kind, setKind] = createState<Kind>("photo")
const [mic, setMic] = createState(false)
const [delay, setDelay] = createState(0)

const wait = (s: number) => new Promise<void>((r) => (s ? timeout(s * 1000, () => r()) : r()))

// hide the session, then the delay, then grim / wf-recorder on the session's selection
export async function capture() {
  if (recording.get()) {
    closeShot()
    return stopRecording()
  }
  const geometry = shotTarget()
  closeShot()
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

// screenshot / record toolbar (the session's ShotMenu.tsx): mode · photo / video · mic · fps · timer · Capture
export default function Toolbar() {
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
      <button
        class="tb-btn timer"
        tooltipText="Frame rate"
        sensitive={kind.as((k) => k === "video")}
        onClicked={() => setFps(nextFps(fps.get()))}
      >
        <box spacing={6}>
          <Icon name="speed" />
          <label label={fps.as(fpsLabel)} />
        </box>
      </button>
      <button class="tb-btn timer" tooltipText="Delay" onClicked={() => setDelay(nextTimer(delay.get()))}>
        <box spacing={6}>
          <Icon name={delay.as((d) => (d ? "timer" : "timer_off"))} />
          <label label={delay.as(timerLabel)} />
        </box>
      </button>
      <button class="tb-capture" onClicked={() => capture()}>
        <label label={recording.as((r) => (r ? "Stop" : "Capture"))} />
      </button>
    </box>
  )
}

import GLib from "gi://GLib"
import { Gtk } from "ags/gtk4"
import { Accessor, createBinding, createComputed, createState, onCleanup } from "ags"
import { timeout } from "ags/time"
import AstalWp from "gi://AstalWp?version=0.1"
import AstalNotifd from "gi://AstalNotifd?version=0.1"
import { open, closeCC, run, NIGHT_K, NIGHT_ICON, nightOn, checkNight, toggleNight } from "./cc"
import { recording, elapsed, toggleRecording, fmtElapsed } from "../../../service/recorder"
import { screenshotRegion } from "../../screenshot/Screenshot"

const onOff = (o: boolean) => (o ? "On" : "Off")

function Tile({ icon, label, sub, on, onClick }: {
  icon: string
  label: string
  sub: string | Accessor<string>
  on?: Accessor<boolean>
  onClick: () => void
}) {
  return (
    <button class={on ? on.as((o) => (o ? "cc-tile on" : "cc-tile")) : "cc-tile"} hexpand onClicked={onClick}>
      <box orientation={Gtk.Orientation.VERTICAL} spacing={10}>
        <image class="cc-icon" halign={Gtk.Align.START} iconName={icon} />
        <box orientation={Gtk.Orientation.VERTICAL} spacing={2}>
          <label class="cc-tile-label" xalign={0} label={label} />
          <label class="cc-sub" xalign={0} label={sub} />
        </box>
      </box>
    </button>
  )
}

// hide the Control Center, then act once its surface is gone (it would show in the capture)
const afterClose = (fn: () => void) => {
  closeCC()
  timeout(250, fn)
}

export default function Tiles() {
  const notifd = AstalNotifd.get_default()
  const dnd = createBinding(notifd, "dontDisturb")

  const mic = AstalWp.get_default()!.audio.defaultMicrophone
  const micMuted = createBinding(mic, "mute")

  // airplane = every radio soft-blocked; re-checked on open
  const [plane, setPlane] = createState(false)
  const checkPlane = () =>
    run(["sh", "-c", "rfkill list | grep -q 'Soft blocked: no' && echo 0 || echo 1"]).then((o) =>
      setPlane(o.trim() === "1"),
    )
  checkPlane()
  onCleanup(
    open.subscribe(() => {
      if (!open.get()) return
      checkPlane()
      checkNight()
    }),
  )

  const canRecord = GLib.find_program_in_path("wf-recorder") !== null

  return (
    <box class="cc-tiles" orientation={Gtk.Orientation.VERTICAL} spacing={8}>
      <box homogeneous spacing={8}>
        <Tile
          icon={NIGHT_ICON}
          label="Night Light"
          sub={nightOn.as((o) => (o ? `${NIGHT_K} K` : "Off"))}
          on={nightOn}
          onClick={toggleNight}
        />
        <Tile
          icon="notifications-disabled-symbolic"
          label="Do Not Disturb"
          sub={dnd.as(onOff)}
          on={dnd}
          onClick={() => (notifd.dontDisturb = !notifd.dontDisturb)}
        />
        <Tile
          icon="airplane-mode-symbolic"
          label="Airplane"
          sub={plane.as(onOff)}
          on={plane}
          onClick={() => {
            const next = !plane.get()
            setPlane(next)
            run(["rfkill", next ? "block" : "unblock", "all"]).then(checkPlane)
          }}
        />
      </box>
      <box homogeneous spacing={8}>
        <Tile
          icon="microphone-sensitivity-muted-symbolic"
          label="Mic Mute"
          sub={micMuted.as(onOff)}
          on={micMuted}
          onClick={() => (mic.mute = !mic.mute)}
        />
        <Tile
          icon="applets-screenshooter-symbolic"
          label="Screenshot"
          sub="Region"
          onClick={() => afterClose(screenshotRegion)}
        />
        <Tile
          icon="media-record-symbolic"
          label="Record"
          sub={createComputed(() =>
            recording() ? fmtElapsed(elapsed()) : canRecord ? "Off" : "Unavailable",
          )}
          on={recording}
          onClick={() => {
            if (!canRecord) return
            recording.get() ? toggleRecording() : afterClose(toggleRecording)
          }}
        />
      </box>
    </box>
  )
}

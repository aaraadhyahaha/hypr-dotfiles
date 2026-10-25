import GLib from "gi://GLib"
import { Gtk } from "ags/gtk4"
import { Accessor, createBinding, createComputed, onCleanup } from "ags"
import { timeout } from "ags/time"
import AstalWp from "gi://AstalWp?version=0.1"
import AstalNotifd from "gi://AstalNotifd?version=0.1"
import { open, closeCC, NIGHT_K, nightOn, checkNight, toggleNight, planeOn, checkPlane, setPlane } from "./cc"
import { recording, elapsed, toggleRecording, fmtElapsed } from "../../../service/recorder"
import { screenshotRegion } from "../../screenshot/Screenshot"
import { LAYER_GONE } from "../../common/motion"
import Icon from "../../common/Icon"

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
        <Icon name={icon} fill class="cc-icon" halign={Gtk.Align.START} />
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
  timeout(LAYER_GONE, fn)
}

export default function Tiles() {
  const notifd = AstalNotifd.get_default()
  const dnd = createBinding(notifd, "dontDisturb")

  const mic = AstalWp.get_default()!.audio.defaultMicrophone
  const micMuted = createBinding(mic, "mute")

  // airplane state is re-checked on open
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
          icon="nightlight"
          label="Night Light"
          sub={nightOn.as((o) => (o ? `${NIGHT_K} K` : "Off"))}
          on={nightOn}
          onClick={toggleNight}
        />
        <Tile
          icon="do_not_disturb_on"
          label="Do Not Disturb"
          sub={dnd.as(onOff)}
          on={dnd}
          onClick={() => (notifd.dontDisturb = !notifd.dontDisturb)}
        />
        <Tile
          icon="flight"
          label="Airplane"
          sub={planeOn.as(onOff)}
          on={planeOn}
          onClick={() => setPlane(!planeOn.get())}
        />
      </box>
      <box homogeneous spacing={8}>
        <Tile
          icon="mic_off"
          label="Mic Mute"
          sub={micMuted.as(onOff)}
          on={micMuted}
          onClick={() => (mic.mute = !mic.mute)}
        />
        <Tile
          icon="screenshot_region"
          label="Screenshot"
          sub="Region"
          onClick={() => afterClose(screenshotRegion)}
        />
        <Tile
          icon="radio_button_checked"
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

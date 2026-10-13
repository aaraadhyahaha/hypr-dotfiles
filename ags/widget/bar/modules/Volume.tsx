import { Gtk } from "ags/gtk4"
import { createBinding } from "ags"
import AstalWp from "gi://AstalWp?version=0.1"
import Swap from "../common/Swap"

export default function Volume() {
  const speaker = AstalWp.get_default()!.audio.defaultSpeaker
  const vol = createBinding(speaker, "volume")
  const muted = createBinding(speaker, "mute")

  return (
    <box class={muted.as((m) => (m ? "volume muted" : "volume"))}>
      <Gtk.EventControllerScroll
        flags={Gtk.EventControllerScrollFlags.VERTICAL}
        onScroll={(_, _dx, dy) => {
          speaker.volume = Math.max(0, Math.min(1, speaker.volume - dy * 0.05))
        }}
      />
      <Gtk.GestureClick onPressed={() => (speaker.mute = !speaker.mute)} />
      <image iconName={createBinding(speaker, "volumeIcon")} />
      <Swap text={vol.as((v) => `${Math.round(v * 100)}%`)} />
    </box>
  )
}

import { Gtk } from "ags/gtk4"
import { createBinding, createState } from "ags"
import { MOTION } from "../../common/motion"
import AstalNetwork from "gi://AstalNetwork?version=0.1"
import AstalBluetooth from "gi://AstalBluetooth?version=0.1"
import AstalWp from "gi://AstalWp?version=0.1"
import VolumeSlider from "./VolumeSlider"
import BrightnessSlider from "./BrightnessSlider"
import Tiles from "./Tiles"
import NetPair from "./NetPair"
import AudioPair from "./AudioPair"
import ThemeMode from "./ThemeMode"
import Accents from "./Accents"
import Resources from "./Resources"

export default function QuickSettings() {
  const wifi = AstalNetwork.get_default().wifi
  const bt = AstalBluetooth.get_default()
  const speaker = AstalWp.get_default()!.audio.defaultSpeaker
  const [open, setOpen] = createState(false)

  return (
    <menubutton class="qs-btn">
      <box class="qs-pill" spacing={4}>
        <Gtk.EventControllerScroll
          flags={Gtk.EventControllerScrollFlags.VERTICAL}
          onScroll={(_, _dx, dy) => {
            speaker.volume = Math.max(0, Math.min(1, speaker.volume - dy * 0.05))
          }}
        />
        <Gtk.GestureClick button={2} onPressed={() => (speaker.mute = !speaker.mute)} />
        {wifi && <image iconName={createBinding(wifi, "iconName")} />}
        <image
          iconName={createBinding(bt, "isPowered").as((p) =>
            p ? "bluetooth-active-symbolic" : "bluetooth-disabled-symbolic",
          )}
        />
        <image iconName={createBinding(speaker, "volumeIcon")} />
      </box>
      <popover
        class="qs-pop"
        hasArrow={false}
        $={(self) => self.connect("notify::visible", () => setOpen(self.visible))}
      >
        <revealer
          transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
          transitionDuration={MOTION.base}
          revealChild={open}
        >
          <box class="qs" orientation={Gtk.Orientation.VERTICAL}>
            <label class="qs-title" xalign={0} label="Quick settings" />
            <VolumeSlider />
            <BrightnessSlider />
            <Tiles />
            <NetPair />
            <AudioPair />
            <ThemeMode />
            <Accents active={open} />
            <Resources active={open} />
          </box>
        </revealer>
      </popover>
    </menubutton>
  )
}

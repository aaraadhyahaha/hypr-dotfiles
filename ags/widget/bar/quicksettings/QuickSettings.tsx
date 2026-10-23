import { Gtk } from "ags/gtk4"
import { createBinding } from "ags"
import AstalNetwork from "gi://AstalNetwork?version=0.1"
import AstalBluetooth from "gi://AstalBluetooth?version=0.1"
import AstalWp from "gi://AstalWp?version=0.1"
import { Motion, ENTER, onShow } from "../../common/motion"
import { setOpen, setPopover, nightOn, NIGHT_ICON } from "./cc"
import Header from "./Header"
import Pair from "./Pair"
import Tiles from "./Tiles"
import Sliders from "./Sliders"
import MediaMini from "./MediaMini"
import Stats from "./Stats"
import ThemeMode from "./ThemeMode"
import Footer from "./Footer"

// bar pill (night light · wifi · bluetooth · volume; scroll = volume, middle-click = mute)
// and the Control Center popover
export default function QuickSettings() {
  const wifi = AstalNetwork.get_default().wifi
  const bt = AstalBluetooth.get_default()
  const speaker = AstalWp.get_default()!.audio.defaultSpeaker
  let motion: Motion

  return (
    <menubutton class="cc-btn">
      <box class="cc-pill" spacing={6}>
        <Gtk.EventControllerScroll
          flags={Gtk.EventControllerScrollFlags.VERTICAL}
          onScroll={(_, _dx, dy) => {
            speaker.volume = Math.max(0, Math.min(1, speaker.volume - dy * 0.05))
          }}
        />
        <Gtk.GestureClick button={2} onPressed={() => (speaker.mute = !speaker.mute)} />
        <image class="cc-pill-night" iconName={NIGHT_ICON} visible={nightOn} />
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
        $={(self) => {
          setPopover(self)
          self.connect("notify::visible", () => setOpen(self.visible))
          onShow(self, motion, ENTER.popover)
        }}
      >
        <Motion origin="top" $={(self) => (motion = self)}>
          <box class="cc" orientation={Gtk.Orientation.VERTICAL} spacing={12}>
            <Header />
            <Pair />
            <Tiles />
            <Sliders />
            <MediaMini />
            <Stats />
            <ThemeMode />
            <Footer />
          </box>
        </Motion>
      </popover>
    </menubutton>
  )
}

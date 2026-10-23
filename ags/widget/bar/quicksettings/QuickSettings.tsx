import { Gtk } from "ags/gtk4"
import AstalNetwork from "gi://AstalNetwork?version=0.1"
import AstalBluetooth from "gi://AstalBluetooth?version=0.1"
import AstalWp from "gi://AstalWp?version=0.1"
import { Motion, ENTER, onShow } from "../../common/motion"
import { open, setOpen, setPopover, nightOn } from "./cc"
import Icon from "../../common/Icon"
import { wifiIcon, btIcon, volumeIcon } from "../../common/icons"
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

  // popup() from the keybind doesn't check the button, so open state is a class
  return (
    <menubutton class={open.as((o) => (o ? "cc-btn open" : "cc-btn"))}>
      <box class="cc-pill" spacing={6}>
        <Gtk.EventControllerScroll
          flags={Gtk.EventControllerScrollFlags.VERTICAL}
          onScroll={(_, _dx, dy) => {
            speaker.volume = Math.max(0, Math.min(1, speaker.volume - dy * 0.05))
          }}
        />
        <Gtk.GestureClick button={2} onPressed={() => (speaker.mute = !speaker.mute)} />
        <box visible={nightOn}>
          <Icon name="nightlight" fill class="cc-pill-night" />
        </box>
        {wifi && <Icon name={wifiIcon(wifi)} fill />}
        <Icon name={btIcon(bt)} fill />
        <Icon name={volumeIcon(speaker)} fill />
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

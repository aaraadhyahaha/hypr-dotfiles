import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { Motion, ENTER } from "../common/motion"
import Toolbar from "./Toolbar"

let toggleFn = () => {}
export const toggleShotMenu = () => toggleFn()

// the capture toolbar as a centered layer window, for the Print key
export default function ShotMenu() {
  let win: Astal.Window
  let motion: Motion

  // instant, so the region picker / grim never see it
  const close = () => (win.visible = false)

  const open = () => {
    motion.animate(ENTER.card)
    win.visible = true
  }

  toggleFn = () => (win.visible ? close() : open())

  return (
    <window
      $={(self) => {
        win = self
        const key = new Gtk.EventControllerKey()
        key.connect("key-pressed", (_, keyval) => {
          if (keyval === Gdk.KEY_Escape) { close(); return true }
          return false
        })
        self.add_controller(key)
      }}
      visible={false}
      name="shotmenu"
      namespace="shotmenu"
      class="ShotMenu"
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.EXCLUSIVE}
      exclusivity={Astal.Exclusivity.IGNORE}
      application={app}
    >
      <Motion $={(self) => (motion = self)}>
        <Toolbar close={close} />
      </Motion>
    </window>
  )
}

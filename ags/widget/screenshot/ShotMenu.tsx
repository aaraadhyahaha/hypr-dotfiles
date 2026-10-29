import app from "ags/gtk4/app"
import { Astal } from "ags/gtk4"
import { Motion, ENTER } from "../common/motion"
import { closeShot, openShot } from "./Screenshot"
import Toolbar from "./Toolbar"

// opens / closes the whole session (the `toggle-shotmenu` IPC, the Print bind, the launcher)
export const toggleShotMenu = () => (app.get_window("shot")?.visible ? closeShot() : openShot())

// the session's toolbar: its own layer so Hyprland blurs it (`shot` must stay unblurred).
// It stacks above `shot` through Hyprland's `order` layer rule (hypr/conf/shell.lua); map order
// doesn't hold. `shot` has the keyboard (ON_DEMAND), so this takes none and a click here
// leaves the focus on `shot`.
export default function ShotMenu() {
  let motion: Motion

  return (
    <window
      $={(self: Astal.Window) => self.connect("notify::visible", () => self.visible && motion.animate(ENTER.card))}
      visible={false}
      name="shotmenu"
      namespace="shotmenu"
      class="ShotMenu"
      layer={Astal.Layer.OVERLAY}
      anchor={Astal.WindowAnchor.BOTTOM}
      keymode={Astal.Keymode.NONE}
      exclusivity={Astal.Exclusivity.IGNORE}
      application={app}
    >
      <Motion $={(self) => (motion = self)}>
        <Toolbar />
      </Motion>
    </window>
  )
}

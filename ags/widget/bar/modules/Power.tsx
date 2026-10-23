import { Gtk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createState } from "ags"
import { Motion, ENTER, onShow } from "../../common/motion"
import Icon from "../../common/Icon"

let menu: Gtk.MenuButton | null = null
// the Control Center's power button opens this menu
export const openPowerMenu = () => menu?.popup()

export default function Power() {
  const [open, setOpen] = createState(false)
  let motion: Motion

  const item = (icon: string, text: string, cmd: string[], danger = false) => (
    <button
      class={danger ? "menu-item danger" : "menu-item"}
      onClicked={() => {
        setOpen(false)
        execAsync(cmd)
      }}
    >
      <box>
        <Icon name={icon} />
        <label label={text} xalign={0} hexpand />
      </box>
    </button>
  )

  return (
    <menubutton
      class="power"
      $={(self) => {
        menu = self
        self.connect("notify::visible", () => setOpen(self.visible))
      }}
    >
      <Icon name="power_settings_new" class="lg" />
      <popover class="power-pop" hasArrow={false} $={(self) => onShow(self, motion, ENTER.popover)}>
        <Motion origin="top" $={(self) => (motion = self)}>
          <box orientation={Gtk.Orientation.VERTICAL} class="menu">
            {item("lock", "Lock", ["loginctl", "lock-session"])}
            {item("bedtime", "Suspend", ["systemctl", "suspend"])}
            {item("logout", "Log out", ["hyprctl", "dispatch", "hl.dsp.exit()"])}
            {item("restart_alt", "Restart", ["systemctl", "reboot"], true)}
            {item("power_settings_new", "Shut down", ["systemctl", "poweroff"], true)}
          </box>
        </Motion>
      </popover>
    </menubutton>
  )
}

import { Gtk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createState } from "ags"
import { Motion, ENTER, onShow } from "../../common/motion"

export default function Power() {
  const [open, setOpen] = createState(false)
  let motion: Motion

  const item = (glyph: string, text: string, cmd: string[], danger = false) => (
    <button
      class={danger ? "menu-item danger" : "menu-item"}
      onClicked={() => {
        setOpen(false)
        execAsync(cmd)
      }}
    >
      <box>
        <label class="glyph" label={glyph} />
        <label label={text} xalign={0} hexpand />
      </box>
    </button>
  )

  return (
    <menubutton
      class="power"
      $={(self) => self.connect("notify::visible", () => setOpen(self.visible))}
    >
      <label class="glyph" label={"\uf011"} />
      <popover class="power-pop" hasArrow={false} $={(self) => onShow(self, motion, ENTER.popover)}>
        <Motion origin="top" $={(self) => (motion = self)}>
          <box orientation={Gtk.Orientation.VERTICAL} class="menu">
            {item("\uf023", "Lock", ["loginctl", "lock-session"])}
            {item("\uf186", "Suspend", ["systemctl", "suspend"])}
            {item("\uf08b", "Log out", ["hyprctl", "dispatch", "hl.dsp.exit()"])}
            {item("\uf021", "Restart", ["systemctl", "reboot"], true)}
            {item("\uf011", "Shut down", ["systemctl", "poweroff"], true)}
          </box>
        </Motion>
      </popover>
    </menubutton>
  )
}

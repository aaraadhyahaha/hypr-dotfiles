import { Gtk } from "ags/gtk4"
import { execAsync } from "ags/process"

export default function Power() {
  let pop: Gtk.Popover

  const item = (glyph: string, text: string, cmd: string[]) => (
    <button
      class="menu-item"
      onClicked={() => {
        pop.popdown()
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
    <menubutton class="power">
      <label class="glyph" label={"\uf011"} />
      <popover $={(self) => (pop = self)} hasArrow={false}>
        <box orientation={Gtk.Orientation.VERTICAL} class="menu">
          {item("\uf023", "Lock", ["loginctl", "lock-session"])}
          {item("\uf186", "Suspend", ["systemctl", "suspend"])}
          {item("\uf08b", "Log out", ["hyprctl", "dispatch", "hl.dsp.exit()"])}
          {item("\uf021", "Restart", ["systemctl", "reboot"])}
          {item("\uf011", "Shut down", ["systemctl", "poweroff"])}
        </box>
      </popover>
    </menubutton>
  )
}

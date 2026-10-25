import { Gdk, Gtk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createState } from "ags"
import { Motion, ENTER, onShow } from "../../common/motion"
import Icon from "../../common/Icon"

let menu: Gtk.MenuButton | null = null
// the Control Center's power button opens this menu
export const openPowerMenu = () => menu?.popup()

// shared with the launcher's `lock` / `suspend` / ... actions
export const POWER = {
  lock: { icon: "lock", text: "Lock", key: "L", cmd: ["loginctl", "lock-session"], danger: false },
  suspend: { icon: "bedtime", text: "Suspend", key: "S", cmd: ["systemctl", "suspend"], danger: false },
  logout: { icon: "logout", text: "Log out", key: "E", cmd: ["hyprctl", "dispatch", "hl.dsp.exit()"], danger: false },
  reboot: { icon: "restart_alt", text: "Restart", key: "R", cmd: ["systemctl", "reboot"], danger: true },
  shutdown: { icon: "power_settings_new", text: "Shut down", key: "P", cmd: ["systemctl", "poweroff"], danger: true },
}

export const runPower = (op: keyof typeof POWER) => execAsync(POWER[op].cmd).catch(console.error)

const ITEMS = Object.values(POWER)

export default function Power() {
  const [open, setOpen] = createState(false)
  let motion: Motion

  const run = (cmd: string[]) => {
    menu?.popdown()
    setOpen(false)
    execAsync(cmd).catch(console.error)
  }

  const item = ({ icon, text, key, cmd, danger }: (typeof ITEMS)[number]) => (
    <button class={danger ? "menu-item danger" : "menu-item"} onClicked={() => run(cmd)}>
      <box spacing={12}>
        <Icon name={icon} />
        <label label={text} xalign={0} hexpand />
        <label class="menu-key" label={key} />
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
      <popover
        class="qs-pop"
        hasArrow={false}
        $={(self: Gtk.Popover) => {
          onShow(self, motion, ENTER.popover)
          // the key hints are live: L / S / E / R / P while the menu is open
          const keys = new Gtk.EventControllerKey()
          keys.connect("key-pressed", (_, keyval) => {
            const k = Gdk.keyval_name(Gdk.keyval_to_upper(keyval))
            const hit = ITEMS.find((i) => i.key === k)
            if (hit) run(hit.cmd)
            return Boolean(hit)
          })
          self.add_controller(keys)
        }}
      >
        <Motion origin="top" $={(self) => (motion = self)}>
          <box orientation={Gtk.Orientation.VERTICAL} class="menu" spacing={2}>
            {ITEMS.map(item)}
          </box>
        </Motion>
      </popover>
    </menubutton>
  )
}

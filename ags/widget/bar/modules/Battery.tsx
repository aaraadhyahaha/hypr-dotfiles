import { Gtk } from "ags/gtk4"
import { createBinding, createComputed } from "ags"
import AstalBattery from "gi://AstalBattery?version=0.1"
import Icon from "../../common/Icon"
import { batteryIcon } from "../../common/icons"
import { Motion, ENTER, onShow } from "../../common/motion"
import BatteryPanel, { refresh } from "./BatteryPanel"

export default function Battery() {
  const bat = AstalBattery.get_default()
  const pct = createBinding(bat, "percentage")
  const charging = createBinding(bat, "charging")
  let motion: Motion

  return (
    <menubutton
      class={pct.as((p) => (p <= 0.2 ? "battery low pulse" : "battery"))}
      visible={createBinding(bat, "isPresent")}
    >
      <box spacing={6}>
        <Icon name={createComputed(() => batteryIcon(pct(), charging()))} fill class="lg bat" />
        <label label={pct.as((p) => `${Math.round(p * 100)}%`)} />
      </box>
      <popover
        class="qs-pop"
        hasArrow={false}
        $={(self: Gtk.Popover) => {
          onShow(self, motion, ENTER.popover)
          self.connect("show", refresh)
        }}
      >
        <Motion origin="top" $={(self) => (motion = self)}>
          <BatteryPanel />
        </Motion>
      </popover>
    </menubutton>
  )
}

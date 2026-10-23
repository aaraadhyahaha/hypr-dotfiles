import { createBinding, createComputed } from "ags"
import AstalBattery from "gi://AstalBattery?version=0.1"
import Icon from "../../common/Icon"
import { batteryIcon } from "../../common/icons"

export default function Battery() {
  const bat = AstalBattery.get_default()
  const pct = createBinding(bat, "percentage")
  const charging = createBinding(bat, "charging")

  return (
    <box
      class={pct.as((p) => (p <= 0.2 ? "battery low pulse" : "battery"))}
      spacing={6}
      visible={createBinding(bat, "isPresent")}
    >
      <Icon name={createComputed(() => batteryIcon(pct(), charging()))} fill class="lg bat" />
      <label label={pct.as((p) => `${Math.round(p * 100)}%`)} />
    </box>
  )
}

import { createBinding } from "ags"
import AstalBattery from "gi://AstalBattery?version=0.1"

export default function Battery() {
  const bat = AstalBattery.get_default()
  const pct = createBinding(bat, "percentage")

  return (
    <box
      class={pct.as((p) => (p <= 0.2 ? "battery low pulse" : "battery"))}
      visible={createBinding(bat, "isPresent")}
    >
      <image iconName={createBinding(bat, "iconName")} />
      <label widthChars={4} xalign={1} label={pct.as((p) => `${Math.round(p * 100)}%`)} />
    </box>
  )
}

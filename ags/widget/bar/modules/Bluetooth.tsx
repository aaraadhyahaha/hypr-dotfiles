import { createBinding } from "ags"
import AstalBluetooth from "gi://AstalBluetooth?version=0.1"

export default function Bluetooth() {
  const bt = AstalBluetooth.get_default()
  const powered = createBinding(bt, "isPowered")

  return (
    <button
      class={powered.as((p) => (p ? "bt" : "bt off"))}
      onClicked={() => bt.toggle()}
    >
      <image
        iconName={powered.as((p) =>
          p ? "bluetooth-active-symbolic" : "bluetooth-disabled-symbolic",
        )}
      />
    </button>
  )
}

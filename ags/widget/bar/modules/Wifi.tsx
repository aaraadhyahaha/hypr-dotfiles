import { createBinding } from "ags"
import Pango from "gi://Pango?version=1.0"
import AstalNetwork from "gi://AstalNetwork?version=0.1"

export default function Wifi() {
  const wifi = AstalNetwork.get_default().wifi

  return (
    <box class="wifi" visible={!!wifi}>
      {wifi && (
        <>
          <image iconName={createBinding(wifi, "iconName")} />
          <label
            maxWidthChars={12}
            ellipsize={Pango.EllipsizeMode.END}
            label={createBinding(wifi, "ssid").as((s) => s ?? "Offline")}
          />
        </>
      )}
    </box>
  )
}

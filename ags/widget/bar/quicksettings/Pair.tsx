import { Gtk } from "ags/gtk4"
import { Accessor, createBinding, createComputed, createState } from "ags"
import Pango from "gi://Pango"
import AstalNetwork from "gi://AstalNetwork?version=0.1"
import AstalBluetooth from "gi://AstalBluetooth?version=0.1"
import Icon from "../../common/Icon"
import { wifiIcon, btIcon } from "../../common/icons"
import { setPage } from "./cc"

// one split button: the main part toggles, the chevron opens its panel
function Half({ icon, title, sub, on, onToggle, onChevron }: {
  icon: Accessor<string>
  title: string
  sub: Accessor<string>
  on: Accessor<boolean>
  onToggle: () => void
  onChevron?: () => void
}) {
  return (
    <box class={on.as((o) => (o ? "cc-half on" : "cc-half"))} hexpand>
      <button class="cc-half-main" hexpand onClicked={onToggle}>
        <box spacing={10}>
          <Icon name={icon} fill class="cc-icon" />
          <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} spacing={2}>
            <label class="cc-name" xalign={0} label={title} />
            <label
              class="cc-sub"
              xalign={0}
              maxWidthChars={12}
              ellipsize={Pango.EllipsizeMode.END}
              label={sub}
            />
          </box>
        </box>
      </button>
      <button class="cc-half-chev" onClicked={() => onChevron?.()}>
        <Icon name="chevron_right" />
      </button>
    </box>
  )
}

function Wifi() {
  const wifi = AstalNetwork.get_default().wifi
  if (!wifi) {
    const [off] = createState(false)
    const [icon] = createState("wifi_off")
    const [sub] = createState("Unavailable")
    return <Half icon={icon} title="Wi-Fi" sub={sub} on={off} onToggle={() => {}} />
  }

  const enabled = createBinding(wifi, "enabled")
  const ssid = createBinding(wifi, "ssid")
  const sub = createComputed(() => (!enabled() ? "Off" : ssid() || "Not connected"))

  return (
    <Half
      icon={wifiIcon(wifi)}
      title="Wi-Fi"
      sub={sub}
      on={enabled}
      onToggle={() => (wifi.enabled = !wifi.enabled)}
      onChevron={() => setPage("wifi")}
    />
  )
}

function Bluetooth() {
  const bt = AstalBluetooth.get_default()
  const powered = createBinding(bt, "isPowered")
  const connected = createBinding(bt, "isConnected")
  const devices = createBinding(bt, "devices")
  const sub = createComputed(() => {
    if (!powered()) return "Off"
    if (!connected()) return "Not connected"
    const d = devices().find((d) => d.connected)
    return d?.alias || d?.name || "Connected"
  })

  return (
    <Half
      icon={btIcon(bt)}
      title="Bluetooth"
      sub={sub}
      on={powered}
      onToggle={() => bt.toggle()}
      onChevron={() => setPage("bt")}
    />
  )
}

export default function Pair() {
  return (
    <box class="cc-pair" homogeneous spacing={8}>
      <Wifi />
      <Bluetooth />
    </box>
  )
}

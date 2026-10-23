import { Gtk } from "ags/gtk4"
import { Accessor, createBinding, createComputed, createState } from "ags"
import Pango from "gi://Pango"
import AstalNetwork from "gi://AstalNetwork?version=0.1"
import AstalBluetooth from "gi://AstalBluetooth?version=0.1"

// one split button: the main part toggles, the chevron opens the panel (phase 4)
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
          <image class="cc-icon" iconName={icon} />
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
        <image iconName="pan-end-symbolic" />
      </button>
    </box>
  )
}

function Wifi() {
  const wifi = AstalNetwork.get_default().wifi
  if (!wifi) {
    const [off] = createState(false)
    const [icon] = createState("network-wireless-disabled-symbolic")
    const [sub] = createState("Unavailable")
    return <Half icon={icon} title="Wi-Fi" sub={sub} on={off} onToggle={() => {}} />
  }

  const enabled = createBinding(wifi, "enabled")
  const ssid = createBinding(wifi, "ssid")
  const sub = createComputed(() => (!enabled() ? "Off" : ssid() || "Not connected"))

  return (
    <Half
      icon={createBinding(wifi, "iconName")}
      title="Wi-Fi"
      sub={sub}
      on={enabled}
      onToggle={() => (wifi.enabled = !wifi.enabled)}
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
      icon={powered.as((p) => (p ? "bluetooth-active-symbolic" : "bluetooth-disabled-symbolic"))}
      title="Bluetooth"
      sub={sub}
      on={powered}
      onToggle={() => bt.toggle()}
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

import { createBinding, For } from "ags"
import { Gtk } from "ags/gtk4"
import { execAsync } from "ags/process"
import AstalNetwork from "gi://AstalNetwork?version=0.1"
import AstalBluetooth from "gi://AstalBluetooth?version=0.1"
import Pair from "./Pair"

export default function NetPair() {
  const wifi = AstalNetwork.get_default().wifi!
  const bt = AstalBluetooth.get_default()
  const ssid = createBinding(wifi, "ssid")

  const aps = createBinding(wifi, "accessPoints").as((l) => {
    const seen = new Set<string>()
    return [...l]
      .filter((a) => a.ssid && !seen.has(a.ssid) && seen.add(a.ssid))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 8)
  })
  const devices = createBinding(bt, "devices").as((l) => l.filter((d) => d.paired))

  const wifiList = (
    <box class="qs-list" orientation={Gtk.Orientation.VERTICAL}>
      <For each={aps}>
        {(ap) => (
          <button
            class={ssid.as((s) => (s === ap.ssid ? "qs-item active" : "qs-item"))}
            onClicked={() => execAsync(["nmcli", "device", "wifi", "connect", ap.ssid!])}
          >
            <box>
              <image iconName={ap.iconName} />
              <label hexpand xalign={0} label={ap.ssid ?? ""} />
              <image visible={ap.requiresPassword} iconName="channel-secure-symbolic" />
            </box>
          </button>
        )}
      </For>
    </box>
  )

  const btList = (
    <box class="qs-list" orientation={Gtk.Orientation.VERTICAL}>
      <For each={devices}>
        {(d) => (
          <button
            class={createBinding(d, "connected").as((c) => (c ? "qs-item active" : "qs-item"))}
            onClicked={() =>
              execAsync(["bluetoothctl", d.connected ? "disconnect" : "connect", d.address])
            }
          >
            <box>
              <image iconName={d.icon ? `${d.icon}-symbolic` : "bluetooth-symbolic"} />
              <label hexpand xalign={0} label={d.name} />
            </box>
          </button>
        )}
      </For>
    </box>
  )

  return (
    <Pair
      a={{
        icon: createBinding(wifi, "iconName"),
        title: "Wi-Fi",
        subtitle: ssid.as((s) => s ?? "Not connected"),
        active: createBinding(wifi, "enabled"),
        onToggle: () => (wifi.enabled = !wifi.enabled),
        onExpand: () => wifi.scan(),
        list: wifiList,
      }}
      b={{
        icon: createBinding(bt, "isPowered").as((p) =>
          p ? "bluetooth-active-symbolic" : "bluetooth-disabled-symbolic",
        ),
        title: "Bluetooth",
        subtitle: createBinding(bt, "isConnected").as((c) => (c ? "Connected" : "Not connected")),
        active: createBinding(bt, "isPowered"),
        onToggle: () => bt.toggle(),
        list: btList,
      }}
    />
  )
}

import { createBinding, createComputed, For, onCleanup } from "ags"
import AstalBluetooth from "gi://AstalBluetooth?version=0.1"
import Icon from "../../common/Icon"
import { page } from "./cc"
import { Panel, Row, Sep, List } from "./Panel"

type Device = AstalBluetooth.Device

// BlueZ's freedesktop icon names → Material Symbols
function deviceIcon(icon: string) {
  if (/headset|headphone/.test(icon)) return "headphones"
  if (/keyboard/.test(icon)) return "keyboard"
  if (/mouse|tablet/.test(icon)) return "mouse"
  if (/phone/.test(icon)) return "smartphone"
  if (/audio|speaker/.test(icon)) return "speaker"
  if (/computer/.test(icon)) return "computer"
  if (/gaming/.test(icon)) return "sports_esports"
  return "bluetooth"
}

// unnamed devices report their address as the alias
const named = (d: Device) => {
  const n = d.alias || d.name
  return !!n && n.replace(/[-:]/g, "") !== d.address.replace(/:/g, "")
}

// astal reports 0..1, or a negative value when the device doesn't say
const battery = (b: number) => (b < 0 ? "" : `${Math.round(b <= 1 ? b * 100 : b)}%`)

function DeviceRow({ d }: { d: Device }) {
  const connected = createBinding(d, "connected")
  const paired = createBinding(d, "paired")
  const connecting = createBinding(d, "connecting")
  const sub = createComputed(() =>
    connecting() ? "Connecting…" : connected() ? "Connected" : paired() ? "Paired" : "Available",
  )
  const level = createBinding(d, "batteryPercentage")
  const batt = createComputed(() => (connected() ? battery(level()) : ""))

  return (
    <Row
      icon={deviceIcon(d.icon ?? "")}
      title={d.alias || d.name}
      sub={sub}
      selected={connected}
      end={<label class="pnl-row-end" label={batt} visible={batt.as(Boolean)} />}
      onClick={() => {
        const fail = (e: unknown) => console.error(`bluetooth: ${e}`)
        if (d.connected) return d.disconnect_device().catch(fail)
        if (!d.paired) {
          try {
            d.pair()
            d.trusted = true
          } catch (e) {
            return fail(e)
          }
        }
        d.connect_device().catch(fail)
      }}
    />
  )
}

export default function BluetoothPanel() {
  const bt = AstalBluetooth.get_default()
  const powered = createBinding(bt, "isPowered")
  const devices = createBinding(bt, "devices")
  const connected = createBinding(bt, "isConnected")
  const discovering = createBinding(bt, "adapter", "discovering").as(Boolean)

  // connected, then paired, then whatever discovery turns up (named ones only)
  const list = createComputed(() => {
    connected()
    if (!powered()) return []
    const rank = (d: Device) => (d.connected ? 0 : d.paired ? 1 : 2)
    return devices()
      .filter(named)
      .sort((a, b) => rank(a) - rank(b) || (a.alias || a.name).localeCompare(b.alias || b.name))
  })

  // discover only while the panel is on screen
  const scan = (on: boolean) => {
    const a = bt.adapter
    if (!a || !a.powered || a.discovering === on) return
    try {
      on ? a.start_discovery() : a.stop_discovery()
    } catch (e) {
      console.error(`bluetooth: ${e}`)
    }
  }
  onCleanup(page.subscribe(() => scan(page.get() === "bt")))
  onCleanup(powered.subscribe(() => scan(page.get() === "bt" && powered.get())))

  return (
    <Panel title="Bluetooth" on={powered} onToggle={() => bt.toggle()}>
      <List>
        <For each={list}>{(d: Device) => <DeviceRow d={d} />}</For>
      </List>
      <label
        class="pnl-empty"
        xalign={0}
        visible={list.as((l) => l.length === 0)}
        label={powered.as((p) => (p ? "No devices" : "Bluetooth is off"))}
      />
      <Sep />
      <button
        class="pnl-row pnl-link"
        sensitive={powered}
        onClicked={() => scan(!bt.adapter?.discovering)}
      >
        <box spacing={8}>
          <Icon name="bluetooth_searching" class="pnl-link-icon" />
          <label label={discovering.as((s) => (s ? "Scanning…" : "Scan for devices"))} />
        </box>
      </button>
    </Panel>
  )
}

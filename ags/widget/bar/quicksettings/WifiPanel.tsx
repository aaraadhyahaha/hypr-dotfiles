import { Gtk } from "ags/gtk4"
import { Accessor, createBinding, createComputed, createState, For, onCleanup } from "ags"
import AstalNetwork from "gi://AstalNetwork?version=0.1"
import Icon from "../../common/Icon"
import { closeCC, page, run } from "./cc"
import { Panel, Row, Sep, List } from "./Panel"

type AP = AstalNetwork.AccessPoint
// NM 802.11 AP security flags (NM_802_11_AP_SEC_KEY_MGMT_*)
const Sec = { KEY_MGMT_802_1X: 0x200, KEY_MGMT_SAE: 0x400 }

// the network_wifi_* glyphs keep the full fan outline, as the mock does
const signal = (s: number) =>
  s > 75 ? "wifi" : s > 50 ? "network_wifi_3_bar" : s > 25 ? "network_wifi_2_bar" : "network_wifi_1_bar"

function security(ap: AP) {
  const rsn = ap.rsnFlags
  if (rsn & Sec.KEY_MGMT_SAE) return "WPA3"
  if (rsn & Sec.KEY_MGMT_802_1X || ap.wpaFlags & Sec.KEY_MGMT_802_1X) return "Enterprise"
  if (rsn) return "WPA2"
  if (ap.wpaFlags) return "WPA"
  return ""
}

// one row per SSID (strongest radio), connected first, then by signal
function networks(aps: AP[], active: AP | null) {
  const best = new Map<string, AP>()
  for (const ap of aps) {
    if (!ap.ssid) continue
    const seen = best.get(ap.ssid)
    if (!seen || ap.strength > seen.strength) best.set(ap.ssid, ap)
  }
  if (active?.ssid) best.set(active.ssid, active)
  return [...best.values()].sort(
    (a, b) => Number(b.ssid === active?.ssid) - Number(a.ssid === active?.ssid) || b.strength - a.strength,
  )
}

function Network({ ap, wifi, asking, setAsking }: {
  ap: AP
  wifi: AstalNetwork.Wifi
  asking: Accessor<string>
  setAsking: (ssid: string) => void
}) {
  const ssid = ap.ssid!
  const active = createBinding(wifi, "activeAccessPoint").as((a) => a?.ssid === ssid)
  const saved = () => ap.get_connections().length > 0
  const sub = active.as((on) => {
    if (on) return ["Connected", security(ap)].filter(Boolean).join(" · ")
    if (saved()) return "Saved"
    return ap.requiresPassword ? "Secured" : "Open"
  })

  const connect = (password: string | null) =>
    ap.activate(password).catch((e: unknown) => console.error(`wifi: ${e}`))

  return (
    <box orientation={Gtk.Orientation.VERTICAL}>
      <Row
        icon={createBinding(ap, "strength").as(signal)}
        title={ssid}
        sub={sub}
        selected={active}
        end={
          ap.requiresPassword ? (
            <Icon name="lock" class="pnl-row-end-icon" />
          ) : (
            <box />
          )
        }
        onClick={() => {
          if (active.get()) wifi.deactivate_connection().catch(() => {})
          else if (ap.requiresPassword && !saved()) setAsking(asking.get() === ssid ? "" : ssid)
          else connect(null)
        }}
      />
      <revealer revealChild={asking.as((a) => a === ssid)}>
        <entry
          class="pnl-field"
          marginTop={4}
          visibility={false}
          placeholderText={`Password for ${ssid}`}
          onActivate={(self: Gtk.Entry) => {
            setAsking("")
            connect(self.text)
            self.text = ""
          }}
        />
      </revealer>
    </box>
  )
}

export default function WifiPanel() {
  const wifi = AstalNetwork.get_default().wifi
  if (!wifi)
    return (
      <Panel title="Wi-Fi">
        <label class="pnl-empty" xalign={0} label="No Wi-Fi device" />
      </Panel>
    )

  const enabled = createBinding(wifi, "enabled")
  const aps = createBinding(wifi, "accessPoints")
  const active = createBinding(wifi, "activeAccessPoint")
  const list = createComputed(() => (enabled() ? networks(aps(), active()) : []))
  const [asking, setAsking] = createState("")

  // rescan each time the panel is shown
  onCleanup(
    page.subscribe(() => {
      setAsking("")
      if (page.get() === "wifi" && wifi.enabled) wifi.scan()
    }),
  )

  return (
    <Panel title="Wi-Fi" on={enabled} onToggle={() => (wifi.enabled = !wifi.enabled)}>
      <List>
        <For each={list} id={(ap) => ap.ssid}>
          {(ap: AP) => <Network ap={ap} wifi={wifi} asking={asking} setAsking={setAsking} />}
        </For>
      </List>
      <label
        class="pnl-empty"
        xalign={0}
        visible={list.as((l) => l.length === 0)}
        label={enabled.as((e) => (e ? "Searching…" : "Wi-Fi is off"))}
      />
      <Sep />
      <button
        class="pnl-row pnl-link"
        onClicked={() => {
          closeCC()
          run(["sh", "-c", "setsid nm-connection-editor >/dev/null 2>&1 &"])
        }}
      >
        <label xalign={0} label="Network settings…" />
      </button>
    </Panel>
  )
}

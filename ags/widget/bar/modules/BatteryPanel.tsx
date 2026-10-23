import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { Gtk } from "ags/gtk4"
import { createBinding, createComputed, createState } from "ags"
import { execAsync } from "ags/process"
import AstalBattery from "gi://AstalBattery?version=0.1"
import Icon from "../../common/Icon"
import Switch from "../quicksettings/Switch"
import { batteryStatus, health, watts } from "./batteryModel"

const PROFILES = [
  { id: "power-saver", icon: "eco", label: "Saver" },
  { id: "balanced", icon: "balance", label: "Balanced" },
  { id: "performance", icon: "bolt", label: "Performance" },
]

// powerprofilesctl has no events we listen to: read on open; hidden when it isn't installed
const hasPpd = GLib.find_program_in_path("powerprofilesctl") !== null
const [profile, setProfile] = createState("")

function setPowerProfile(id: string) {
  setProfile(id)
  execAsync(["powerprofilesctl", "set", id]).catch(() => refresh())
}

// The real battery's UPower object: AstalBattery's default is the DisplayDevice, which has no
// health, cycles or charge limit. UPower's polkit rule lets the active session toggle the limit.
const UPOWER = "org.freedesktop.UPower"
const BATTERY = 2 // UP_DEVICE_KIND_BATTERY

function findBattery(): Gio.DBusProxy | null {
  try {
    const bus = Gio.bus_get_sync(Gio.BusType.SYSTEM, null)
    const [paths] = bus
      .call_sync(UPOWER, "/org/freedesktop/UPower", UPOWER, "EnumerateDevices", null, null, Gio.DBusCallFlags.NONE, -1, null)
      .deepUnpack() as [string[]]
    for (const path of paths) {
      const p = Gio.DBusProxy.new_sync(bus, Gio.DBusProxyFlags.NONE, null, UPOWER, path, `${UPOWER}.Device`, null)
      if (p.get_cached_property("PowerSupply")?.unpack() && p.get_cached_property("Type")?.unpack() === BATTERY)
        return p
    }
  } catch (e) {
    console.error(e)
  }
  return null
}

const battery = findBattery()
const prop = <T,>(name: string, fallback: T): T => (battery?.get_cached_property(name)?.unpack() as T) ?? fallback

const [limitOn, setLimitOn] = createState(false)
const [limitEnd, setLimitEnd] = createState(0)
const [healthText, setHealthText] = createState("")
const [rate, setRate] = createState("")
const hasLimit = prop("ChargeThresholdSupported", false)

const sync = () => {
  setLimitOn(prop("ChargeThresholdEnabled", false))
  setLimitEnd(prop("ChargeEndThreshold", 0))
  setHealthText(health(prop("Capacity", 0), prop("ChargeCycles", 0)))
  setRate(watts(prop("EnergyRate", 0)))
}
battery?.connect("g-properties-changed", sync)
sync()

const toggleLimit = () =>
  battery?.call("EnableChargeThreshold", new GLib.Variant("(b)", [!limitOn.get()]), Gio.DBusCallFlags.NONE, -1, null, (p, res) => {
    try {
      p!.call_finish(res)
    } catch (e) {
      console.error(e)
    }
    sync()
  })

// called when the popover opens
export function refresh() {
  if (hasPpd)
    execAsync(["powerprofilesctl", "get"])
      .then((o) => setProfile(o.trim()))
      .catch(() => setProfile(""))
}

function Profile({ id, icon, label }: (typeof PROFILES)[number]) {
  return (
    <button
      class={profile.as((p) => (p === id ? "batt-seg on" : "batt-seg"))}
      onClicked={() => setPowerProfile(id)}
    >
      <box orientation={Gtk.Orientation.VERTICAL} halign={Gtk.Align.CENTER} spacing={4}>
        <Icon name={icon} fill />
        <label label={label} />
      </box>
    </button>
  )
}

// battery popover (Battery.tsx): % and time left · charge track · power profile · charge limit · health
export default function BatteryPanel() {
  const bat = AstalBattery.get_default()
  const pct = createBinding(bat, "percentage")
  const state = createBinding(bat, "state")
  const charging = createBinding(bat, "charging")
  const toEmpty = createBinding(bat, "timeToEmpty")
  const toFull = createBinding(bat, "timeToFull")
  const status = createComputed(() =>
    batteryStatus({
      charging: charging(),
      full: state() === AstalBattery.State.FULLY_CHARGED,
      discharging: state() === AstalBattery.State.DISCHARGING,
      toEmpty: toEmpty(),
      toFull: toFull(),
    }),
  )

  return (
    <box class="batt" orientation={Gtk.Orientation.VERTICAL} spacing={14}>
      <box spacing={10}>
        <label class="batt-pct" valign={Gtk.Align.BASELINE_FILL} label={pct.as((p) => `${Math.round(p * 100)}%`)} />
        <label class="batt-status" valign={Gtk.Align.BASELINE_FILL} label={status} />
      </box>

      <Gtk.ProgressBar class={pct.as((p) => (p <= 0.2 ? "batt-track low" : "batt-track"))} fraction={pct} />

      <box class="batt-profiles" homogeneous visible={hasPpd && profile.as(Boolean)}>
        {PROFILES.map((p) => (
          <Profile {...p} />
        ))}
      </box>

      <box visible={hasLimit}>
        <label hexpand xalign={0} label={limitEnd.as((n) => `Limit charge to ${n}%`)} />
        <Switch on={limitOn} onToggle={toggleLimit} />
      </box>

      <box class="batt-foot" visible={createComputed(() => healthText() !== "" || rate() !== "")}>
        <label hexpand xalign={0} label={healthText} />
        <label label={rate} />
      </box>
    </box>
  )
}

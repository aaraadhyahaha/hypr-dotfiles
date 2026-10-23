import GLib from "gi://GLib"
import { createBinding, createComputed, createState, onCleanup } from "ags"
import AstalBattery from "gi://AstalBattery?version=0.1"
import { open, run } from "./cc"
import Icon from "../../common/Icon"
import { batteryIcon } from "../../common/icons"
import { batteryStatus } from "../modules/batteryModel"

// power-saver → Power Saver
const profileName = (p: string) => p.replace(/(^|-)(\w)/g, (_, d, c) => (d ? " " : "") + c.toUpperCase())

export default function Footer() {
  const bat = AstalBattery.get_default()
  const present = createBinding(bat, "isPresent")
  const pct = createBinding(bat, "percentage")
  const charging = createBinding(bat, "charging")
  const state = createBinding(bat, "state")
  const toEmpty = createBinding(bat, "timeToEmpty")
  const toFull = createBinding(bat, "timeToFull")

  const text = createComputed(() => {
    const p = `${Math.round(pct() * 100)}%`
    const status = batteryStatus({
      charging: charging(),
      full: state() === AstalBattery.State.FULLY_CHARGED,
      discharging: state() === AstalBattery.State.DISCHARGING,
      toEmpty: toEmpty(),
      toFull: toFull(),
    })
    return status ? `${p} · ${status}` : p
  })

  // powerprofilesctl has no events we listen to: read on open; empty when it isn't installed
  const [profile, setProfile] = createState("")
  const has = GLib.find_program_in_path("powerprofilesctl") !== null
  const read = () =>
    has && run(["powerprofilesctl", "get"]).then((o) => setProfile(o.trim() && profileName(o.trim())))
  read()
  onCleanup(open.subscribe(() => open.get() && read()))

  const shown = createComputed(() => present() || profile() !== "")

  return (
    <box class="cc-footer" spacing={8} visible={shown}>
      <box visible={present}>
        <Icon name={createComputed(() => batteryIcon(pct(), charging()))} fill class="bat" />
      </box>
      <label label={text} visible={present} />
      <box hexpand />
      <label label={profile} visible={profile.as(Boolean)} />
    </box>
  )
}

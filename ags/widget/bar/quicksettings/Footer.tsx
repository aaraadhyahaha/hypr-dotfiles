import GLib from "gi://GLib"
import { createBinding, createComputed, createState, onCleanup } from "ags"
import AstalBattery from "gi://AstalBattery?version=0.1"
import { open, run } from "./cc"

// 3 h 12 min, 45 min
const dur = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor(s / 60) % 60
  return h ? `${h} h ${m} min` : `${m} min`
}

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
    if (charging()) return toFull() > 0 ? `${p} · ${dur(toFull())} to full` : `${p} · Charging`
    if (state() === AstalBattery.State.FULLY_CHARGED) return `${p} · Fully charged`
    // plugged in but holding (charge limit): upower still reports a bogus time to empty
    if (state() !== AstalBattery.State.DISCHARGING) return `${p} · Plugged in`
    return toEmpty() > 0 ? `${p} · ${dur(toEmpty())} left` : p
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
      <image iconName={createBinding(bat, "iconName")} visible={present} />
      <label label={text} visible={present} />
      <box hexpand />
      <label label={profile} visible={profile.as(Boolean)} />
    </box>
  )
}

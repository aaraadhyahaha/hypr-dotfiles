import GLib from "gi://GLib"
import { Gtk } from "ags/gtk4"
import { createState, onCleanup } from "ags"
import { interval } from "ags/time"
import { open, closeCC, run } from "./cc"
import { openPowerMenu } from "../modules/Power"

const user = GLib.get_user_name()
const real = GLib.get_real_name()
const name = real && real !== "Unknown" ? real : user

// "up 3 h 12 min", "up 2 d 4 h", "up 12 min"
function uptime() {
  try {
    const [, bytes] = GLib.file_get_contents("/proc/uptime")
    const s = Math.floor(Number(new TextDecoder().decode(bytes).split(" ")[0]))
    const d = Math.floor(s / 86400)
    const h = Math.floor(s / 3600) % 24
    const m = Math.floor(s / 60) % 60
    return d ? `up ${d} d ${h} h` : h ? `up ${h} h ${m} min` : `up ${m} min`
  } catch {
    return ""
  }
}

function RoundBtn({ icon, tooltip, onClick }: { icon: string; tooltip: string; onClick: () => void }) {
  return (
    <button class="cc-round" tooltipText={tooltip} valign={Gtk.Align.CENTER} onClicked={onClick}>
      <image iconName={icon} />
    </button>
  )
}

export default function Header() {
  const [up, setUp] = createState(uptime())

  // refresh on open and each minute while open
  let tick: ReturnType<typeof interval> | null = null
  const sync = () => {
    tick?.cancel()
    tick = null
    if (!open.get()) return
    setUp(uptime())
    tick = interval(60000, () => setUp(uptime()))
  }
  onCleanup(open.subscribe(sync))

  const act = (fn: () => void) => () => {
    closeCC()
    fn()
  }

  return (
    <box class="cc-header" spacing={10}>
      <label class="cc-avatar" label={user.charAt(0).toUpperCase()} />
      <box orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} hexpand spacing={2}>
        <label class="cc-name" xalign={0} label={name} />
        <label class="cc-sub" xalign={0} label={up} />
      </box>
      <RoundBtn icon="emblem-system-symbolic" tooltip="Settings" onClick={act(() => run(["nwg-look"]))} />
      <RoundBtn
        icon="system-lock-screen-symbolic"
        tooltip="Lock"
        onClick={act(() => run(["loginctl", "lock-session"]))}
      />
      <RoundBtn icon="system-shutdown-symbolic" tooltip="Power" onClick={act(openPowerMenu)} />
    </box>
  )
}

import GLib from "gi://GLib"
import { createState } from "ags"
import { execAsync } from "ags/process"
import Icon from "../../common/Icon"

// awake = hypridle stopped, so the screen never idles off. Shared with the launcher's toggle.
const [awake, setAwake] = createState(false)

// pgrep exits non-zero when hypridle isn't running
export const caffeineOn = () =>
  execAsync(["pgrep", "-x", "hypridle"]).then(
    () => false,
    () => true,
  ).then((a) => {
    setAwake(a)
    return a
  })

export const setCaffeine = (on: boolean) => {
  setAwake(on)
  return execAsync(["sh", "-c", on ? "pkill -x hypridle" : "setsid hypridle >/dev/null 2>&1 &"]).catch(console.error)
}

// clicks update the state directly; a slow check catches hypridle started or killed elsewhere
let watching = false
function watch() {
  if (watching) return
  watching = true
  caffeineOn()
  GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 30, () => {
    caffeineOn()
    return GLib.SOURCE_CONTINUE
  })
}

export default function Caffeine() {
  watch()
  return (
    <button
      class={awake.as((a) => (a ? "icon-btn on" : "icon-btn"))}
      onClicked={() => setCaffeine(!awake.get())}
    >
      <Icon name="coffee" class="lg" />
    </button>
  )
}

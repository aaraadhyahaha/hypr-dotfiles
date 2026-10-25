import { createPoll } from "ags/time"
import { execAsync } from "ags/process"
import Icon from "../../common/Icon"

// awake = hypridle stopped, so the screen never idles off
export const caffeineOn = () =>
  execAsync(["sh", "-c", "pgrep -x hypridle >/dev/null && echo 1 || echo 0"])
    .then((s) => s.trim() === "0")
    .catch(() => false)

export const setCaffeine = (awake: boolean) =>
  execAsync(["sh", "-c", awake ? "pkill -x hypridle" : "setsid hypridle >/dev/null 2>&1 &"]).catch(console.error)

export default function Caffeine() {
  // "1" while hypridle is running; stopping it = staying awake
  const state = createPoll("1", 1000, [
    "sh", "-c", "pgrep -x hypridle >/dev/null && echo 1 || echo 0",
  ])
  const awake = state.as((s) => s.trim() === "0")

  return (
    <button
      class={awake.as((a) => (a ? "icon-btn on" : "icon-btn"))}
      onClicked={() => setCaffeine(!awake.get())}
    >
      <Icon name="coffee" class="lg" />
    </button>
  )
}

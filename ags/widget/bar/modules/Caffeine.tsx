import { createPoll } from "ags/time"
import { execAsync } from "ags/process"

export default function Caffeine() {
  // "1" while hypridle is running; stopping it = staying awake
  const state = createPoll("1", 1000, [
    "sh", "-c", "pgrep -x hypridle >/dev/null && echo 1 || echo 0",
  ])
  const awake = state.as((s) => s.trim() === "0")

  return (
    <button
      class={awake.as((a) => (a ? "icon-btn on" : "icon-btn"))}
      onClicked={() =>
        execAsync([
          "sh", "-c",
          state.get().trim() === "1"
            ? "pkill -x hypridle"
            : "setsid hypridle >/dev/null 2>&1 &",
        ])
      }
    >
      <label class="glyph" label={"\uf0f4"} />
    </button>
  )
}

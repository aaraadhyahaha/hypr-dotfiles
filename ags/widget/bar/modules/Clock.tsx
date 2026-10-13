import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import { createPoll } from "ags/time"
import Reveal from "../common/Reveal"

export default function Clock() {
  const time = createPoll("", 1000, "date +%H:%M")
  const date = createPoll("", 60000, "date '+%a, %d %b'")
  const [hover, setHover] = createState(false)

  return (
    <box class="clock">
      <Gtk.EventControllerMotion
        onEnter={() => setHover(true)}
        onLeave={() => setHover(false)}
      />
      <label label={time} />
      <Reveal show={hover}>
        <label class="date" label={date} />
      </Reveal>
    </box>
  )
}

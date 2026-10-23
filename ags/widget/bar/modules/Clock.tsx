import { createPoll } from "ags/time"

export default function Clock() {
  const time = createPoll("", 1000, "date +%H:%M")
  const date = createPoll("", 60000, "date '+%a %-d %b'")

  return (
    <box class="clock">
      <label class="date" label={date} />
      <label label={time} />
    </box>
  )
}

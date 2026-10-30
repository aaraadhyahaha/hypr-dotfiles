import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState, onCleanup } from "ags"

const now = (fmt: string) => GLib.DateTime.new_now_local().format(fmt) ?? ""

export default function Clock() {
  const [time, setTime] = createState(now("%H:%M"))
  const [date, setDate] = createState(now("%a %-d %b"))
  const update = () => {
    setTime(now("%H:%M"))
    setDate(now("%a %-d %b"))
  }

  // wake once a minute, just after it turns, instead of polling every second
  let source = 0
  const schedule = () => {
    source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60_000 - (Date.now() % 60_000) + 50, () => {
      update()
      schedule()
      return GLib.SOURCE_REMOVE
    })
  }
  schedule()

  // GLib timers use the monotonic clock, which stops during suspend: catch up on resume
  const bus = Gio.DBus.system
  const sleep = bus.signal_subscribe(
    "org.freedesktop.login1", "org.freedesktop.login1.Manager", "PrepareForSleep",
    "/org/freedesktop/login1", null, Gio.DBusSignalFlags.NONE,
    (_c, _s, _p, _i, _n, params) => {
      if (params.deepUnpack<[boolean]>()[0]) return
      GLib.source_remove(source)
      update()
      schedule()
    },
  )

  onCleanup(() => {
    GLib.source_remove(source)
    bus.signal_unsubscribe(sleep)
  })

  return (
    <box class="clock">
      <label class="date" label={date} />
      <label label={time} />
    </box>
  )
}

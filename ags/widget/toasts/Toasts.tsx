import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { createRoot } from "ags"
import { timeout } from "ags/time"
import { MOTION } from "../common/motion"
import AstalNotifd from "gi://AstalNotifd"
import NotifRow from "../notifications/NotifRow"
import { toastTimeout } from "../notifications/model"

export default function Toasts() {
  const notifd = AstalNotifd.get_default()
  const live = new Map<number, { leave: (instant?: boolean) => void }>()
  let win: Astal.Window
  let box: Gtk.Box

  const show = (n: AstalNotifd.Notification) => {
    live.get(n.id)?.leave(true) // same id = replaced: drop the old one instantly

    const w = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
    w.add_css_class("toast")
    w.add_css_class("in")
    if (n.urgency === AstalNotifd.Urgency.CRITICAL) w.add_css_class("critical")
    // built in its own root so its bindings are disposed when the toast leaves
    let dispose = () => {}
    w.append(
      createRoot((d) => {
        dispose = d
        return NotifRow({ n, onDone: () => leave() }) as Gtk.Widget
      }),
    )

    let gone = false
    let resolved = 0
    const leave = (instant = false) => {
      if (gone) return
      gone = true
      live.delete(n.id)
      const finish = () => {
        n.disconnect(resolved)
        dispose()
        box.remove(w)
        if (!box.get_first_child()) win.visible = false
      }
      if (instant) return finish()
      w.remove_css_class("in")
      w.add_css_class("out")
      timeout(MOTION.exit, finish)
    }

    const click = new Gtk.GestureClick()
    click.connect("pressed", () => leave())
    w.add_controller(click)

    live.set(n.id, { leave })
    box.append(w)
    win.visible = true

    timeout(MOTION.enter, () => w.remove_css_class("in")) // so the entry animation never replays
    const ms = toastTimeout(n)
    if (ms !== null) timeout(ms, () => leave())
    resolved = n.connect("resolved", () => leave())
  }

  notifd.connect("notified", (_, id) => {
    const n = notifd.get_notification(id)
    if (n) show(n)
  })

  const { TOP, RIGHT } = Astal.WindowAnchor

  return (
    <window
      $={(self) => (win = self)}
      visible={false}
      name="toasts"
      namespace="toasts"
      class="Toasts"
      layer={Astal.Layer.OVERLAY}
      anchor={TOP | RIGHT}
      application={app}
    >
      <box $={(self) => (box = self)} orientation={Gtk.Orientation.VERTICAL} />
    </window>
  )
}
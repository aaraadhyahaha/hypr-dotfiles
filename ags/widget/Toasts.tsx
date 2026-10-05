import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { timeout } from "ags/time"
import AstalNotifd from "gi://AstalNotifd"

export default function Toasts() {
  const notifd = AstalNotifd.get_default()
  const live = new Map<number, { leave: (instant?: boolean) => void }>()
  let win: Astal.Window
  let box: Gtk.Box

  const label = (text: string, cls: string) => {
    const l = new Gtk.Label({ label: text, xalign: 0, wrap: true })
    l.add_css_class(cls)
    return l
  }

  const show = (n: AstalNotifd.Notification) => {
    live.get(n.id)?.leave(true) // same id = replaced: drop the old one instantly

    const w = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
    w.add_css_class("toast")
    w.add_css_class("in")
    w.append(label(n.appName, "app"))
    w.append(label(n.summary, "summary"))
    if (n.body) w.append(label(n.body, "notif-body"))

    let gone = false
    const leave = (instant = false) => {
      if (gone) return
      gone = true
      live.delete(n.id)
      const finish = () => {
        box.remove(w)
        if (!box.get_first_child()) win.visible = false
      }
      if (instant) return finish()
      w.remove_css_class("in")
      w.add_css_class("out")
      timeout(260, finish)
    }

    const click = new Gtk.GestureClick()
    click.connect("pressed", () => leave())
    w.add_controller(click)

    live.set(n.id, { leave })
    box.append(w)
    win.visible = true

    timeout(520, () => w.remove_css_class("in")) // so the entry animation never replays
    timeout(5000, () => leave())
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
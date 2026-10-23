import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { createRoot } from "ags"
import { timeout } from "ags/time"
import { Motion, ENTER, LEAVE, MOTION } from "../common/motion"
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
    if (n.urgency === AstalNotifd.Urgency.CRITICAL) w.add_css_class("critical")
    // built in its own root so its bindings are disposed when the toast leaves
    let dispose = () => {}
    w.append(
      createRoot((d) => {
        dispose = d
        return NotifRow({ n, onDone: () => leave(), toast: true }) as Gtk.Widget
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
        box.remove(slot)
        if (!box.get_first_child()) win.visible = false
      }
      if (instant) return finish()
      // back out past the screen edge, then collapse the empty slot so the toasts below glide up
      motion.animate({
        ...LEAVE.edge,
        done: () => {
          // last one out: the window hides, nothing to glide
          if (box.get_first_child() === slot && !slot.get_next_sibling()) return finish()
          slot.revealChild = false
          timeout(MOTION.base, finish)
        },
      })
    }

    const click = new Gtk.GestureClick()
    click.connect("pressed", (_, _n, x, y) => {
      // buttons (actions, dismiss) handle their own click; the body press must not remove them mid-click
      const hit = w.pick(x, y, Gtk.PickFlags.DEFAULT)
      if (hit && (hit instanceof Gtk.Button || hit.get_ancestor(Gtk.Button.$gtype))) return
      leave()
    })
    w.add_controller(click)

    // the toast slides in from past the screen edge: the window clips it there.
    // No fade, so the compositor blur travels with the glass instead of popping in.
    const motion = new Motion()
    motion.append(w)
    const slot = new Gtk.Revealer({
      transitionType: Gtk.RevealerTransitionType.SLIDE_UP,
      transitionDuration: MOTION.base,
      revealChild: true,
      child: motion,
    })

    live.set(n.id, { leave })
    motion.animate(ENTER.edge)
    box.append(slot)
    win.visible = true
    const ms = toastTimeout(n)
    if (ms !== null) timeout(ms, () => leave())
    resolved = n.connect("resolved", () => leave())
  }

  notifd.connect("notified", (_, id) => {
    const n = notifd.get_notification(id)
    // DND silences toasts but keeps history; critical ones still get through
    if (n && (!notifd.dontDisturb || n.urgency === AstalNotifd.Urgency.CRITICAL)) show(n)
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
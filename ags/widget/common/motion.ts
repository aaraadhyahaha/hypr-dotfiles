import { Gtk } from "ags/gtk4"
import { timeout } from "ags/time"

// mirrors the motion tokens in styles/_tokens.scss; AGS owns all shell motion
export const MOTION = { fast: 160, base: 220, enter: 280, exit: 180 }

const pending = new WeakMap<Gtk.Widget, { cancel: () => void }>()

// play the `.in` animation; cancels an exit still in flight
export function enter(w: Gtk.Widget) {
  pending.get(w)?.cancel()
  pending.delete(w)
  w.remove_css_class("out")
  w.remove_css_class("in")
  // next frame, so a re-added class restarts the animation
  timeout(16, () => w.add_css_class("in"))
}

// play the `.out` animation, then run `done` (usually hiding the window)
export function exit(w: Gtk.Widget, done: () => void) {
  if (pending.has(w)) return
  w.remove_css_class("in")
  w.add_css_class("out")
  pending.set(
    w,
    timeout(MOTION.exit, () => {
      pending.delete(w)
      w.remove_css_class("out")
      done()
    }),
  )
}

export const exiting = (w: Gtk.Widget) => pending.has(w)

import { Gtk } from "ags/gtk4"
import { timeout } from "ags/time"

// mirrors the motion tokens in styles/_tokens.scss; AGS owns all shell motion
export const MOTION = { fast: 120, base: 180, enter: 220, exit: 140 }

const pending = new WeakMap<Gtk.Widget, { cancel: () => void }>()

// play the `.in` animation; cancels an exit still in flight.
// call before showing the surface: `.in` must be set when it maps, or the
// first frame paints at full opacity and the animation blinks in after it
export function enter(w: Gtk.Widget) {
  pending.get(w)?.cancel()
  pending.delete(w)
  // swapping .out for .in changes animation-name, which restarts it
  w.remove_css_class("out")
  w.add_css_class("in")
}

// play the `.out` animation, then run `done` (usually hiding the window)
export function exit(w: Gtk.Widget, done: () => void) {
  if (pending.has(w)) return
  w.remove_css_class("in")
  w.add_css_class("out")
  pending.set(
    w,
    // one extra frame so the last keyframe paints before `done` hides it
    timeout(MOTION.exit + 16, () => {
      pending.delete(w)
      w.remove_css_class("out")
      done()
    }),
  )
}

export const exiting = (w: Gtk.Widget) => pending.has(w)

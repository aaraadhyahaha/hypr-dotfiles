import GObject from "gi://GObject"
import GLib from "gi://GLib"
import Graphene from "gi://Graphene"
import { Gtk } from "ags/gtk4"

// Motion model (see DESIGN.md › Motion):
// - Hyprland owns opacity of every AGS layer and popup, so the blur behind a panel
//   fades with its tint instead of snapping on/off at the ignore_alpha threshold.
// - AGS owns geometry: a <Motion> wrapper transforms its content at paint time,
//   driven by the frame clock. No relayout, no CSS-animation start races, interruptible.
// - Surfaces leave by hiding at once; the compositor fades the last frame out.

// durations in ms, mirrored by the SCSS tokens in styles/_tokens.scss
export const MOTION = { fast: 110, base: 200, enter: 380, exit: 180, slide: 460 }

export type Ease = (t: number) => number

// CSS cubic-bezier(x1, y1, x2, y2) as a function of linear progress
function bezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const x = (t: number) => ((ax * t + bx) * t + cx) * t
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  const y = (t: number) => ((ay * t + by) * t + cy) * t
  return (p) => {
    if (p <= 0) return 0
    if (p >= 1) return 1
    let t = p
    for (let i = 0; i < 6; i++) {
      const d = dx(t)
      if (Math.abs(d) < 1e-6) break
      t -= (x(t) - p) / d
    }
    // Newton can wander on flat curves; bisection always lands
    if (t < 0 || t > 1 || Math.abs(x(t) - p) > 1e-4) {
      let lo = 0, hi = 1
      t = p
      for (let i = 0; i < 24; i++) {
        x(t) < p ? (lo = t) : (hi = t)
        t = (lo + hi) / 2
      }
    }
    return y(t)
  }
}

// same curves as $ease / $ease-out / $ease-in
export const EASE = {
  standard: bezier(0.25, 0.1, 0.25, 1),
  out: bezier(0.16, 1, 0.3, 1), // fast arrival, long quiet settle
  in: bezier(0.4, 0, 1, 1),
}

// offset from rest: px translation, fx = fraction of own width, scale, opacity;
// sx/sy stretch one axis on top of scale (a widget morphing between sizes)
export type Pose = { x?: number; y?: number; fx?: number; scale?: number; sx?: number; sy?: number; opacity?: number }
type Full = Required<Pose>
const REST: Full = { x: 0, y: 0, fx: 0, scale: 1, sx: 1, sy: 1, opacity: 1 }

export type Anim = {
  from?: Pose // omitted: start from wherever it is now
  to?: Pose // omitted: rest
  duration: number
  ease: Ease
  done?: () => void
}

const full = (p?: Pose): Full => ({ ...REST, ...p })
const lerp = (a: Full, b: Full, e: number): Full => ({
  x: a.x + (b.x - a.x) * e,
  y: a.y + (b.y - a.y) * e,
  fx: a.fx + (b.fx - a.fx) * e,
  scale: a.scale + (b.scale - a.scale) * e,
  sx: a.sx + (b.sx - a.sx) * e,
  sy: a.sy + (b.sy - a.sy) * e,
  opacity: a.opacity + (b.opacity - a.opacity) * e,
})
const atRest = (p: Full) =>
  p.x === 0 && p.y === 0 && p.fx === 0 && p.scale === 1 && p.sx === 1 && p.sy === 1 && p.opacity === 1

const animationsOn = () => Gtk.Settings.get_default()?.gtkEnableAnimations ?? true

// A transparent wrapper that paints its children at an animated pose; `origin` is the scale pivot
// (center, top, bottom, or top-left).
// It is a Box only so JSX can append children; layout is a BinLayout.
export const Motion = GObject.registerClass(
  {
    GTypeName: "AgsMotion",
    Properties: {
      origin: GObject.ParamSpec.string("origin", "", "", GObject.ParamFlags.READWRITE, "center"),
    },
  },
  class Motion extends Gtk.Box {
    declare _origin: string
    declare _pose: Full
    declare _tick: number

    constructor(props?: Partial<Gtk.Box.ConstructorProps> & { origin?: string }) {
      super(props)
      // children fill it, exactly as they would fill its parent
      this.set_layout_manager(new Gtk.BinLayout())
      this._pose ??= { ...REST }
      this._tick ??= 0
    }

    get origin() {
      return this._origin ?? "center"
    }

    set origin(v: string) {
      if (this._origin === v) return
      this._origin = v
      this.notify("origin")
    }

    get pose(): Full {
      return { ...this._pose }
    }

    // jump to `from` (or stay put), then glide to `to` on the frame clock.
    // Call before the surface shows: the first frame paints at `from`.
    animate({ from, to, duration, ease, done }: Anim) {
      this.stop()
      const a = from ? full(from) : this.pose
      const b = full(to)
      if (!animationsOn() || duration <= 0) {
        this.set(b)
        done?.()
        return
      }
      this.set(a)
      let t0 = -1
      this._tick = this.add_tick_callback((_w, clock) => {
        const now = clock.get_frame_time()
        if (t0 < 0) t0 = now
        const p = Math.min(1, (now - t0) / (duration * 1000))
        this.set(p >= 1 ? b : lerp(a, b, ease(p)))
        if (p < 1) return GLib.SOURCE_CONTINUE
        this._tick = 0
        done?.()
        return GLib.SOURCE_REMOVE
      })
    }

    stop() {
      if (this._tick) this.remove_tick_callback(this._tick)
      this._tick = 0
    }

    set(p: Pose) {
      this._pose = full(p)
      this.queue_draw()
    }

    vfunc_snapshot(s: Gtk.Snapshot) {
      const p = this._pose
      if (atRest(p)) return super.vfunc_snapshot(s)
      const w = this.get_width()
      const h = this.get_height()
      const o = this.origin
      const px = o === "top-left" ? 0 : w / 2
      const py = o === "top" || o === "top-left" ? 0 : o === "bottom" ? h : h / 2
      s.save()
      s.translate(new Graphene.Point({ x: px + p.x + p.fx * w, y: py + p.y }))
      if (p.scale !== 1 || p.sx !== 1 || p.sy !== 1) s.scale(p.scale * p.sx, p.scale * p.sy)
      s.translate(new Graphene.Point({ x: -px, y: -py }))
      const fade = p.opacity < 1
      if (fade) s.push_opacity(Math.max(0, p.opacity))
      super.vfunc_snapshot(s)
      if (fade) s.pop()
      s.restore()
    }
  },
)
export type Motion = InstanceType<typeof Motion>

// presets: geometry only for layer surfaces and popups (Hyprland fades those)
export const ENTER = {
  // centred cards: settle from slightly small
  card: { from: { scale: 0.96 }, duration: MOTION.enter, ease: EASE.out },
  // bar popovers: grow down out of the bar
  popover: { from: { y: -4, scale: 0.97 }, duration: MOTION.enter, ease: EASE.out },
  // OSD: rise from below
  rise: { from: { y: 14, scale: 0.97 }, duration: MOTION.enter, ease: EASE.out },
  // overview: zoom out from the desktop
  zoom: { from: { scale: 1.04 }, duration: MOTION.enter, ease: EASE.out },
  // toasts: arrive from the screen edge (no fade, so the blur travels with the glass)
  edge: { from: { fx: 1 }, duration: MOTION.slide, ease: EASE.out },
  // content appearing inside an open panel (it fades itself: no compositor here)
  content: { from: { y: -6, opacity: 0 }, duration: MOTION.enter * 0.8, ease: EASE.out },
  // a bar item widening (the clock's date)
  side: { from: { x: -6, opacity: 0 }, duration: MOTION.enter * 0.8, ease: EASE.out },
  // a desktop widget appearing on the grid (added from the gallery)
  add: { from: { scale: 0.9, opacity: 0 }, duration: MOTION.enter, ease: EASE.out },
} satisfies Record<string, Anim>

// a desktop widget dropped into its slot: glide the leftover offset (and lift) back to rest
export const settle = (from: Pose): Anim => ({ from, duration: MOTION.enter, ease: EASE.out })
// picked up: a slight lift that follows the pointer
export const LIFT = 1.03

export const LEAVE = {
  edge: { to: { fx: 1 }, duration: MOTION.exit + 60, ease: EASE.in },
  content: { to: { opacity: 0 }, duration: MOTION.exit * 0.7, ease: EASE.in },
  // a desktop widget removed: shrink and fade where it stands
  remove: { to: { scale: 0.9, opacity: 0 }, duration: MOTION.exit, ease: EASE.in },
} satisfies Record<string, Anim>

// play `anim` on `m` every time `w` (a popover, a window) is about to show
export function onShow(w: Gtk.Widget, m: Motion, anim: Anim) {
  w.connect("notify::visible", () => {
    if (w.visible) m.animate(anim)
  })
}

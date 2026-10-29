import { Gdk, Gtk } from "ags/gtk4"
import GObject from "gi://GObject"
import Graphene from "gi://Graphene"
import Gsk from "gi://Gsk"
import { EASE, MOTION } from "../../common/motion"

// Drawing helpers shared by desktop widgets (and the pomodoro ring, heatmap and stat graph). They
// build GSK paths into a Gtk.Snapshot, so the GPU renders them; no cairo surface is rasterised on
// the CPU per redraw. Every colour comes from the canvas's CSS `color`, so a widget follows the
// matugen palette and light/dark mode.

export type RGBA = { red: number; green: number; blue: number; alpha: number }

// `c` at `alpha` times its own alpha
export const ink = (c: RGBA, alpha = 1) => new Gdk.RGBA({ red: c.red, green: c.green, blue: c.blue, alpha: c.alpha * alpha })
// `c` at exactly `alpha`
export const shade = (c: RGBA, alpha: number) => new Gdk.RGBA({ red: c.red, green: c.green, blue: c.blue, alpha })

export const point = (x: number, y: number) => new Graphene.Point().init(x, y)

export function stroke(width: number, cap = Gsk.LineCap.BUTT) {
  const s = Gsk.Stroke.new(width)
  s.set_line_cap(cap)
  return s
}

// cairo's arc(): a line from the current point (a move when `first`) to the start, then clockwise
// from `a1` to `a2` (radians, 0 = 3 o'clock), in pieces of at most 90°
export function arc(b: Gsk.PathBuilder, cx: number, cy: number, r: number, a1: number, a2: number, first = false) {
  const at = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  const [x, y] = at(a1)
  if (first) b.move_to(x, y)
  else b.line_to(x, y)
  const n = Math.ceil((a2 - a1) / (Math.PI / 2))
  for (let i = 1; i <= n; i++) {
    const [px, py] = at(a1 + ((a2 - a1) * i) / n)
    b.svg_arc_to(r, r, 0, false, true, px, py)
  }
}

export function arcPath(cx: number, cy: number, r: number, a1: number, a2: number): Gsk.Path {
  const b = Gsk.PathBuilder.new()
  arc(b, cx, cy, r, a1, a2, true)
  return b.to_path()
}

export function circle(cx: number, cy: number, r: number): Gsk.Path {
  const b = Gsk.PathBuilder.new()
  b.add_circle(point(cx, cy), r)
  return b.to_path()
}

export function roundRect(x: number, y: number, w: number, h: number, r: number): Gsk.Path {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  const b = Gsk.PathBuilder.new()
  arc(b, x + w - r, y + r, r, -Math.PI / 2, 0, true)
  arc(b, x + w - r, y + h - r, r, 0, Math.PI / 2)
  arc(b, x + r, y + h - r, r, Math.PI / 2, Math.PI)
  arc(b, x + r, y + r, r, Math.PI, (3 * Math.PI) / 2)
  b.close()
  return b.to_path()
}

export const fill = (s: Gtk.Snapshot, path: Gsk.Path, c: Gdk.RGBA) => s.append_fill(path, Gsk.FillRule.WINDING, c)

// a progress ring from 12 o'clock: faint full track, round-capped arc for `frac`
export function ring(s: Gtk.Snapshot, cx: number, cy: number, r: number, width: number, frac: number, c: RGBA) {
  const line = stroke(width, Gsk.LineCap.ROUND)
  s.append_stroke(arcPath(cx, cy, r, 0, 2 * Math.PI), line, ink(c, 0.16))
  const f = Math.max(0, Math.min(1, frac))
  if (f <= 0) return
  s.append_stroke(arcPath(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + f * 2 * Math.PI), line, ink(c))
}

// vertical bars scaled to `top`, rounded tops; empty bars keep a faint stub so the axis reads
export function bars(s: Gtk.Snapshot, w: number, h: number, values: number[], top: number, c: RGBA, gap = 4) {
  if (!values.length) return
  const bw = (w - gap * (values.length - 1)) / values.length
  values.forEach((v, i) => {
    const bh = Math.max(3, (Math.min(v, top) / top) * h)
    fill(s, roundRect(i * (bw + gap), h - bh, bw, bh, Math.min(3, bw / 2)), ink(c, v > 0 ? 1 : 0.16))
  })
}

export type Paint = (s: Gtk.Snapshot, w: number, h: number, c: RGBA, self: Gtk.Widget) => void

// paints with `_paint` at snapshot time; clipped to its own box, as a DrawingArea's surface was
const Canvas = GObject.registerClass(
  { GTypeName: "AgsCanvas" },
  class Canvas extends Gtk.Widget {
    declare _paint: Paint | null
    _content = [0, 0]

    // like DrawingArea's content-width/height: the content box, so CSS margin/padding add to it
    vfunc_measure(orientation: Gtk.Orientation): [number, number, number, number] {
      const n = this._content[orientation === Gtk.Orientation.HORIZONTAL ? 0 : 1]
      return [n, n, -1, -1]
    }

    vfunc_snapshot(s: Gtk.Snapshot) {
      const w = this.get_width()
      const h = this.get_height()
      if (!this._paint || w <= 0 || h <= 0) return
      s.push_clip(new Graphene.Rect().init(0, 0, w, h))
      this._paint(s, w, h, this.get_color(), this)
      s.pop()
    }
  },
)

// a widget that redraws with `draw` on queue_draw and whose colour is its CSS classes' `color`
type CanvasProps = Partial<Gtk.Widget.ConstructorProps> & { contentWidth?: number; contentHeight?: number }

export function canvas(cls: string, draw: Paint, { contentWidth = 0, contentHeight = 0, ...props }: CanvasProps = {}) {
  const area = new Canvas({ hexpand: true, vexpand: true, ...props })
  area._paint = draw
  area._content = [contentWidth, contentHeight]
  for (const c of cls.split(" ").filter(Boolean)) area.add_css_class(c)
  return area
}

// run `tick` on the frame clock only while `live` is true and the widget is mapped
export function tickWhile(widget: Gtk.Widget, live: { get(): boolean; subscribe(cb: () => void): () => void }, tick: () => void) {
  let id = 0
  const sync = () => {
    const want = live.get() && widget.get_mapped()
    if (want && !id) {
      id = widget.add_tick_callback(() => {
        tick()
        return true
      })
    } else if (!want && id) {
      widget.remove_tick_callback(id)
      id = 0
    }
  }
  const unsub = live.subscribe(sync)
  const m = widget.connect("map", sync)
  const u = widget.connect("unmap", sync)
  sync()
  return () => {
    unsub()
    widget.disconnect(m)
    widget.disconnect(u)
    if (id) widget.remove_tick_callback(id)
    id = 0
  }
}

// a number that eases to each new target on the frame clock and redraws `widget` as it goes:
// rings fill on appear and glide between readings instead of jumping
export function tween(widget: Gtk.Widget, initial = 0, duration = MOTION.enter * 2) {
  let value = initial
  let from = initial
  let to = initial
  let t0 = -1
  let id = 0
  const animations = () => Gtk.Settings.get_default()?.gtkEnableAnimations ?? true
  return {
    get: () => value,
    set(v: number) {
      if (v === to) return
      from = value
      to = v
      t0 = -1
      if (!animations() || !widget.get_mapped()) {
        value = v
        widget.queue_draw()
        return
      }
      if (id) return
      id = widget.add_tick_callback((_w, clock) => {
        const now = clock.get_frame_time()
        if (t0 < 0) t0 = now
        const p = Math.min(1, (now - t0) / (duration * 1000))
        value = from + (to - from) * EASE.out(p)
        widget.queue_draw()
        if (p < 1) return true
        id = 0
        return false
      })
    },
  }
}

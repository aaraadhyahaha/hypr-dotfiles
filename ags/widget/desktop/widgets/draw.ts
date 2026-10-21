import { Gtk } from "ags/gtk4"
import cairo from "cairo"

// Cairo helpers shared by desktop widgets (and the pomodoro heatmap). Every colour comes from
// the drawing area's CSS `color`, so a widget follows the matugen palette and light/dark mode.

export type RGBA = { red: number; green: number; blue: number; alpha: number }

export function roundRect(cr: cairo.Context, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  cr.newPath()
  cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0)
  cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2)
  cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI)
  cr.arc(x + r, y + r, r, Math.PI, (3 * Math.PI) / 2)
  cr.closePath()
}

export const ink = (cr: cairo.Context, c: RGBA, alpha = 1) => cr.setSourceRGBA(c.red, c.green, c.blue, c.alpha * alpha)

// a progress ring from 12 o'clock: faint full track, round-capped arc for `frac`
export function ring(cr: cairo.Context, cx: number, cy: number, r: number, width: number, frac: number, c: RGBA) {
  cr.setLineWidth(width)
  cr.setLineCap(cairo.LineCap.ROUND)
  ink(cr, c, 0.16)
  cr.newPath()
  cr.arc(cx, cy, r, 0, 2 * Math.PI)
  cr.stroke()
  const f = Math.max(0, Math.min(1, frac))
  if (f <= 0) return
  ink(cr, c)
  cr.newPath()
  cr.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + f * 2 * Math.PI)
  cr.stroke()
}

// vertical bars scaled to `top`, rounded tops; empty bars keep a faint stub so the axis reads
export function bars(cr: cairo.Context, w: number, h: number, values: number[], top: number, c: RGBA, gap = 4) {
  if (!values.length) return
  const bw = (w - gap * (values.length - 1)) / values.length
  values.forEach((v, i) => {
    const bh = Math.max(3, (Math.min(v, top) / top) * h)
    ink(cr, c, v > 0 ? 1 : 0.16)
    roundRect(cr, i * (bw + gap), h - bh, bw, bh, Math.min(3, bw / 2))
    cr.fill()
  })
}

// a DrawingArea that redraws with `draw` and whose colour is its CSS class's `color`
export function canvas(
  cls: string,
  draw: (cr: cairo.Context, w: number, h: number, c: RGBA) => void,
  props: Partial<Gtk.DrawingArea.ConstructorProps> = {},
) {
  const area = new Gtk.DrawingArea({ hexpand: true, vexpand: true, ...props })
  area.add_css_class(cls)
  area.set_draw_func((a, cr, w, h) => draw(cr as unknown as cairo.Context, w, h, a.get_color()))
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

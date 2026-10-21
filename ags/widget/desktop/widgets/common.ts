import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { onCleanup, type Accessor } from "ags"
import { bars, canvas, ring, tween } from "./draw"
import { isoDay } from "../dates"

// Building blocks shared by desktop widgets. Imperative GTK, so each returns a plain widget.

export const label = (text: string | Accessor<string>, cls: string, props: Partial<Gtk.Label.ConstructorProps> = {}) => {
  const l = new Gtk.Label({ xalign: 0, ...props })
  for (const c of cls.split(" ").filter(Boolean)) l.add_css_class(c)
  if (typeof text === "string") l.label = text
  else {
    l.label = text.get()
    onCleanup(text.subscribe(() => (l.label = text.get())))
  }
  return l
}

export const box = (cls: string, vertical = false, spacing = 0, children: Gtk.Widget[] = [], props: Partial<Gtk.Box.ConstructorProps> = {}) => {
  const b = new Gtk.Box({ orientation: vertical ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL, spacing, ...props })
  for (const c of cls.split(" ").filter(Boolean)) b.add_css_class(c)
  for (const c of children) b.append(c)
  return b
}

// a ring that fills to `frac` (eased), with widgets stacked in its middle
export function Ring(opts: { size: number; width: number; frac: Accessor<number>; cls?: string; center?: Gtk.Widget[] }) {
  let t: ReturnType<typeof tween>
  const area = canvas(
    `dw-ring ${opts.cls ?? ""}`,
    (cr, w, h, c) => ring(cr, w / 2, h / 2, Math.min(w, h) / 2 - opts.width / 2 - 1, opts.width, t.get(), c),
    { widthRequest: opts.size, heightRequest: opts.size, hexpand: false, vexpand: false },
  )
  t = tween(area, 0)
  // fill from empty the first time it shows, then glide between readings
  const sync = () => t.set(opts.frac.get())
  const m = area.connect("map", sync)
  onCleanup(opts.frac.subscribe(sync))
  onCleanup(() => area.disconnect(m))

  const o = new Gtk.Overlay({ child: area, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER })
  if (opts.center?.length) {
    const mid = box("dw-ring-center", true, 0, opts.center, { halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER })
    o.add_overlay(mid)
  }
  return o
}

// a horizontal meter: faint track, eased fill
export function Meter(frac: Accessor<number>, cls = "") {
  let t: ReturnType<typeof tween>
  const area = canvas(
    `dw-meter ${cls}`,
    (cr, w, h, c) => {
      const r = h / 2
      const path = (x: number, wid: number) => {
        cr.newPath()
        cr.arc(x + r, r, r, Math.PI / 2, (3 * Math.PI) / 2)
        cr.arc(x + wid - r, r, r, -Math.PI / 2, Math.PI / 2)
        cr.closePath()
      }
      cr.setSourceRGBA(c.red, c.green, c.blue, 0.16)
      path(0, w)
      cr.fill()
      const f = Math.max(0, Math.min(1, t.get()))
      if (f <= 0) return
      cr.setSourceRGBA(c.red, c.green, c.blue, 1)
      path(0, Math.max(h, w * f))
      cr.fill()
    },
    { heightRequest: 6, vexpand: false, valign: Gtk.Align.CENTER },
  )
  t = tween(area, 0)
  const sync = () => t.set(frac.get())
  const m = area.connect("map", sync)
  onCleanup(frac.subscribe(sync))
  onCleanup(() => area.disconnect(m))
  return area
}

// bars that grow in on appear and re-ease when the values change
export function Bars(values: Accessor<number[]>, top: (v: number[]) => number, height: number, cls = "") {
  let t: ReturnType<typeof tween>
  const area = canvas(
    `dw-bars ${cls}`,
    (cr, w, h, c) => {
      const v = values.get()
      bars(cr, w, h, v.map((x) => x * t.get()), top(v), c)
    },
    { heightRequest: height, vexpand: false },
  )
  t = tween(area, 0)
  const m = area.connect("map", () => t.set(1))
  onCleanup(values.subscribe(() => area.queue_draw()))
  onCleanup(() => area.disconnect(m))
  return area
}

export function EmptyState(glyph: string, title: string, sub = "") {
  const g = label(glyph, "glyph dw-empty-glyph", { xalign: 0.5 })
  const kids: Gtk.Widget[] = [g, label(title, "dw-empty-title", { xalign: 0.5, wrap: true, justify: Gtk.Justification.CENTER })]
  if (sub) kids.push(label(sub, "dw-empty-sub", { xalign: 0.5, wrap: true, justify: Gtk.Justification.CENTER }))
  return box("dw-empty", true, 4, kids, { valign: Gtk.Align.CENTER, halign: Gtk.Align.CENTER, hexpand: true, vexpand: true })
}

// one dot per task, coloured by how much it matters (5 = error, 4 = tertiary, 3 = primary)
export function SeverityDot(severity: number) {
  const d = new Gtk.Box({ valign: Gtk.Align.CENTER })
  d.add_css_class("dw-sev")
  d.add_css_class(`sev-${Math.max(1, Math.min(5, severity))}`)
  return d
}

// call `fn` when the date rolls over (checked each minute; cheap)
export function onNewDay(fn: () => void) {
  let day = isoDay(new Date())
  const id = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 60, () => {
    const d = isoDay(new Date())
    if (d !== day) {
      day = d
      fn()
    }
    return GLib.SOURCE_CONTINUE
  })
  onCleanup(() => GLib.source_remove(id))
}

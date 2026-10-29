import { Gdk, Gtk } from "ags/gtk4"
import { onCleanup } from "ags"
import { createPoll } from "ags/time"
import GLib from "gi://GLib"
import Gsk from "gi://Gsk"
import Pango from "gi://Pango"
import { canvas, circle, fill, ink, point, stroke, tickWhile } from "./draw"
import type { WidgetProps } from "./types"

// S: an analog face whose second hand sweeps on the frame clock. M: the time and date.

const TAU = 2 * Math.PI

// a hand drawn once pointing up and rotated into place by the snapshot transform
function hand(s: Gtk.Snapshot, cx: number, cy: number, angle: number, len: number, tail: number, width: number, c: Gdk.RGBA) {
  const b = Gsk.PathBuilder.new()
  b.move_to(0, tail)
  b.line_to(0, -len)
  s.save()
  s.translate(point(cx, cy))
  s.rotate((angle * 180) / Math.PI)
  s.append_stroke(b.to_path(), stroke(width, Gsk.LineCap.ROUND), c)
  s.restore()
}

function Analog({ live }: WidgetProps) {
  const geo = (w: number, h: number) => ({ cx: w / 2, cy: h / 2, r: Math.min(w, h) / 2 - 2 })

  const face = canvas("dw-clock-face", (s, w, h, c, self) => {
    const { cx, cy, r } = geo(w, h)
    fill(s, circle(cx, cy, r), ink(c, 0.07))
    const hours = Gsk.PathBuilder.new()
    const minutes = Gsk.PathBuilder.new()
    for (let i = 0; i < 60; i++) {
      const hour = i % 5 === 0
      const a = (i / 60) * TAU
      const r1 = r - 5
      const r0 = r1 - (hour ? 5 : 2.5)
      const b = hour ? hours : minutes
      b.move_to(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0)
      b.line_to(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1)
    }
    s.append_stroke(hours.to_path(), stroke(1.6), ink(c, 0.9))
    s.append_stroke(minutes.to_path(), stroke(1), ink(c, 0.35))
    const font = Pango.FontDescription.from_string("SF Pro Text")
    font.set_absolute_size(r * 0.2 * Pango.SCALE)
    for (let n = 1; n <= 12; n++) {
      const a = (n / 12) * TAU
      const layout = self.create_pango_layout(String(n))
      layout.set_font_description(font)
      // centre the glyphs' ink box on the numeral's spot
      const e = layout.get_extents()[0]!
      const rr = r * 0.66
      s.save()
      s.translate(point(
        cx + Math.sin(a) * rr - (e.x + e.width / 2) / Pango.SCALE,
        cy - Math.cos(a) * rr - (e.y + e.height / 2) / Pango.SCALE,
      ))
      s.append_layout(layout, ink(c, 0.9))
      s.restore()
    }
  })

  // hour and minute hands; redrawn with the second hand while live, else once a minute
  const hands = canvas("dw-clock-hands", (s, w, h, c) => {
    const { cx, cy, r } = geo(w, h)
    const d = new Date()
    const m = d.getMinutes() + d.getSeconds() / 60
    const hr = (d.getHours() % 12) + m / 60
    hand(s, cx, cy, (hr / 12) * TAU, r * 0.48, 0, 4, ink(c))
    hand(s, cx, cy, (m / 60) * TAU, r * 0.74, 0, 3, ink(c))
    fill(s, circle(cx, cy, 4), ink(c))
  })

  const second = canvas("dw-clock-second", (s, w, h, c) => {
    const { cx, cy, r } = geo(w, h)
    const d = new Date()
    const sec = d.getSeconds() + d.getMilliseconds() / 1000
    hand(s, cx, cy, (sec / 60) * TAU, r * 0.8, r * 0.16, 1.4, ink(c))
    fill(s, circle(cx, cy, 2.5), ink(c))
  })

  const overlay = new Gtk.Overlay({ child: face, hexpand: true, vexpand: true })
  overlay.add_css_class("dw-clock-analog")
  overlay.add_overlay(hands)
  overlay.add_overlay(second)

  const stopTick = tickWhile(overlay, live, () => {
    hands.queue_draw()
    second.queue_draw()
  })
  // a frozen face would be wrong the moment it shows again; keep minutes right meanwhile
  const minute = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 30, () => {
    if (!live.get()) hands.queue_draw()
    return GLib.SOURCE_CONTINUE
  })
  onCleanup(() => {
    stopTick()
    GLib.source_remove(minute)
  })
  return overlay
}

function Digital(_: WidgetProps) {
  const now = createPoll(GLib.DateTime.new_now_local(), 1000, () => GLib.DateTime.new_now_local())
  return (
    <box class="dw-clock-digital" orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} hexpand>
      <label class="dw-eyebrow" xalign={0} label={now.as((d) => (d.format("%A") ?? "").toUpperCase())} />
      <label class="dw-clock-time" xalign={0} label={now.as((d) => d.format("%H:%M") ?? "")} />
      <label class="dw-sub" xalign={0} label={now.as((d) => d.format("%-d %B %Y") ?? "")} />
    </box>
  )
}

export default function Clock(p: WidgetProps) {
  return p.size === "s" ? Analog(p) : Digital(p)
}

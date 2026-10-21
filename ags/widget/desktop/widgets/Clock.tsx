import { Gtk } from "ags/gtk4"
import { onCleanup } from "ags"
import { createPoll } from "ags/time"
import GLib from "gi://GLib"
import cairo from "cairo"
import { canvas, ink, tickWhile } from "./draw"
import type { WidgetProps } from "./types"

// S: an analog face whose second hand sweeps on the frame clock. M: the time and date.

const TAU = 2 * Math.PI

function hand(cr: cairo.Context, cx: number, cy: number, angle: number, len: number, tail: number, width: number) {
  const sx = Math.sin(angle)
  const sy = -Math.cos(angle)
  cr.setLineWidth(width)
  cr.setLineCap(cairo.LineCap.ROUND)
  cr.moveTo(cx - sx * tail, cy - sy * tail)
  cr.lineTo(cx + sx * len, cy + sy * len)
  cr.stroke()
}

function Analog({ live }: WidgetProps) {
  const geo = (w: number, h: number) => ({ cx: w / 2, cy: h / 2, r: Math.min(w, h) / 2 - 2 })

  const face = canvas("dw-clock-face", (cr, w, h, c) => {
    const { cx, cy, r } = geo(w, h)
    ink(cr, c, 0.07)
    cr.arc(cx, cy, r, 0, TAU)
    cr.fill()
    for (let i = 0; i < 60; i++) {
      const hour = i % 5 === 0
      const a = (i / 60) * TAU
      const r1 = r - 5
      const r0 = r1 - (hour ? 5 : 2.5)
      ink(cr, c, hour ? 0.9 : 0.35)
      cr.setLineWidth(hour ? 1.6 : 1)
      cr.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0)
      cr.lineTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1)
      cr.stroke()
    }
    cr.selectFontFace("SF Pro Text", cairo.FontSlant.NORMAL, cairo.FontWeight.NORMAL)
    cr.setFontSize(r * 0.2)
    ink(cr, c, 0.9)
    for (let n = 1; n <= 12; n++) {
      const a = (n / 12) * TAU
      const t = String(n)
      const e = cr.textExtents(t)
      const rr = r * 0.66
      cr.moveTo(cx + Math.sin(a) * rr - e.width / 2 - e.xBearing, cy - Math.cos(a) * rr - e.height / 2 - e.yBearing)
      cr.showText(t)
    }
  })

  // hour and minute hands; redrawn with the second hand while live, else once a minute
  const hands = canvas("dw-clock-hands", (cr, w, h, c) => {
    const { cx, cy, r } = geo(w, h)
    const d = new Date()
    const m = d.getMinutes() + d.getSeconds() / 60
    const hr = (d.getHours() % 12) + m / 60
    ink(cr, c)
    hand(cr, cx, cy, (hr / 12) * TAU, r * 0.48, 0, 4)
    hand(cr, cx, cy, (m / 60) * TAU, r * 0.74, 0, 3)
    cr.arc(cx, cy, 4, 0, TAU)
    cr.fill()
  })

  const second = canvas("dw-clock-second", (cr, w, h, c) => {
    const { cx, cy, r } = geo(w, h)
    const d = new Date()
    const s = d.getSeconds() + d.getMilliseconds() / 1000
    ink(cr, c)
    hand(cr, cx, cy, (s / 60) * TAU, r * 0.8, r * 0.16, 1.4)
    cr.arc(cx, cy, 2.5, 0, TAU)
    cr.fill()
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

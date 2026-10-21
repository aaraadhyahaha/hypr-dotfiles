import { Gtk } from "ags/gtk4"
import { createComputed, createState, onCleanup } from "ags"
import GLib from "gi://GLib"
import Pango from "gi://Pango"
import { countdownLabel, daysUntil, progressBetween } from "../dates"
import { Ring, box, label, onNewDay } from "./common"
import { editorPopover, field } from "./editor"
import type { Config, WidgetProps } from "./types"

// Vision: days until a date that matters, the ring filling as it gets closer.

const str = (v: unknown) => (typeof v === "string" ? v : "")

function prettyDate(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ""
  const d = GLib.DateTime.new_local(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, 0)
  return d?.format("%a, %-d %b %Y") ?? ""
}

export default function Countdown(p: WidgetProps) {
  // bumps at midnight so "days to go" and the ring move on
  const [day, setDay] = createState(0)
  onNewDay(() => setDay(day.get() + 1))
  const state = (c: Config) => {
    const target = str(c.date)
    return { target, days: daysUntil(target), frac: progressBetween(str(c.created), target) }
  }
  const now = createComputed(() => {
    day()
    return state(p.config())
  })

  const big = label("", "dw-count-big", { xalign: 0.5 })
  const unit = label("", "dw-ring-caption", { xalign: 0.5 })
  const ring = Ring({ size: p.size === "s" ? 92 : 104, width: 9, frac: now.as((s) => s.frac), cls: "dw-count-ring", center: [big, unit] })

  const title = label("", p.size === "s" ? "dw-count-title-s" : "dw-count-title", {
    wrap: p.size !== "s",
    lines: 2,
    ellipsize: Pango.EllipsizeMode.END,
    xalign: p.size === "s" ? 0.5 : 0,
  })
  const when = label("", "dw-sub")
  const left = label("", "dw-count-left")

  const sync = () => {
    const c = p.config.get()
    const s = now.get()
    const d = s.days
    big.label = d === null ? "–" : d === 0 ? "" : String(Math.abs(d))
    if (d === 0) big.add_css_class("glyph")
    else big.remove_css_class("glyph")
    unit.label = d === null ? "" : d === 0 ? "today" : Math.abs(d) === 1 ? (d > 0 ? "day" : "day ago") : d > 0 ? "days" : "days ago"
    title.label = str(c.title) || "Untitled"
    when.label = prettyDate(s.target)
    left.label = countdownLabel(d)
  }
  onCleanup(now.subscribe(sync))
  sync()

  if (p.size === "s")
    return box("dw-count-s", true, 6, [ring, title], { valign: Gtk.Align.CENTER, halign: Gtk.Align.CENTER, hexpand: true })
  return box("dw-count-m", false, 16, [
    ring,
    box("", true, 4, [label("COUNTDOWN", "dw-eyebrow"), title, when, left], { valign: Gtk.Align.CENTER, hexpand: true }),
  ])
}

export function editCountdown(anchor: Gtk.Widget, config: Config, set: (c: Config) => void) {
  const cal = new Gtk.Calendar()
  cal.add_css_class("dw-editor-cal")
  const m = str(config.date).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) cal.select_day(GLib.DateTime.new_local(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, 0)!)
  cal.connect("day-selected", () => set({ date: cal.get_date().format("%Y-%m-%d") ?? "" }))
  return editorPopover(anchor, "Countdown", [
    field("Counting down to", str(config.title), (v) => set({ title: v }), "Graduation, a trip, a launch…"),
    box("dw-field-row", true, 4, [label("Date", "dw-field-name"), cal]),
  ])
}

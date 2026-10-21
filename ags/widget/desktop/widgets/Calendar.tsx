import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { isoDay, monthGrid } from "../dates"
import { box, label, onNewDay } from "./common"
import type { WidgetProps } from "./types"

// S: today as a date tile. L: the month, Monday first, today in the accent.

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]

function Tile() {
  const fmt = (f: string) => GLib.DateTime.new_now_local().format(f) ?? ""
  const weekday = label("", "dw-eyebrow", { xalign: 0.5 })
  const day = label("", "dw-cal-day", { xalign: 0.5 })
  const month = label("", "dw-sub", { xalign: 0.5 })
  const sync = () => {
    weekday.label = fmt("%A").toUpperCase()
    day.label = fmt("%-d")
    month.label = fmt("%B")
  }
  sync()
  onNewDay(sync)
  return box("dw-cal-tile", true, 0, [weekday, day, month], { valign: Gtk.Align.CENTER, halign: Gtk.Align.CENTER, hexpand: true })
}

function Month() {
  const title = label("", "dw-cal-month")
  const year = label("", "dw-sub dw-cal-year", { hexpand: true })
  const grid = new Gtk.Grid({ columnHomogeneous: true, rowHomogeneous: true, hexpand: true, vexpand: true })
  grid.add_css_class("dw-cal-grid")

  const render = () => {
    let c
    while ((c = grid.get_first_child())) grid.remove(c)
    const now = new Date()
    const today = isoDay(now)
    const dt = GLib.DateTime.new_now_local()
    title.label = dt.format("%B") ?? ""
    year.label = dt.format("%Y") ?? ""
    WEEKDAYS.forEach((d, i) => grid.attach(label(d, "dw-cal-weekday", { xalign: 0.5 }), i, 0, 1, 1))
    monthGrid(now.getFullYear(), now.getMonth() + 1).forEach((cell, i) => {
      const l = label(String(cell.day), "dw-cal-cell", { xalign: 0.5, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER })
      if (!cell.inMonth) l.add_css_class("out")
      if (cell.iso === today) l.add_css_class("today")
      if (i % 7 >= 5) l.add_css_class("weekend")
      grid.attach(l, i % 7, 1 + Math.floor(i / 7), 1, 1)
    })
  }
  render()
  onNewDay(render)
  return box("dw-cal-l", true, 8, [box("", false, 6, [title, year]), grid], { hexpand: true, vexpand: true })
}

export default function Calendar(p: WidgetProps) {
  return p.size === "s" ? Tile() : Month()
}

import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import Icon from "../../common/Icon"
import { isoDay, monthGrid } from "../../desktop/dates"

const DAY_NAMES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

// Date menu calendar: weekday / long date, month row with chevrons, Monday-first grid.
// Only the weeks the month touches are drawn. `reset` (on open) jumps back to today.
export default function DateCalendar({ onReady }: { onReady: (api: { reset: () => void }) => void }) {
  const now = () => GLib.DateTime.new_now_local()
  let year = 0
  let month = 0 // 1-12
  let weekday: Gtk.Label
  let date: Gtk.Label
  let title: Gtk.Label
  let grid: Gtk.Grid
  let days: Gtk.Widget[] = []

  const render = () => {
    const today = isoDay(new Date())
    const shown = GLib.DateTime.new_local(year, month, 1, 0, 0, 0)
    title.label = (year === now().get_year() ? shown.format("%B") : shown.format("%B %Y")) ?? ""

    days.forEach((w) => grid.remove(w))
    days = []
    const cells = monthGrid(year, month)
    // drop trailing weeks that are all next month
    while (cells.length > 7 && cells.slice(-7).every((d) => !d.inMonth)) cells.splice(-7)
    cells.forEach((d, i) => {
      const cls = ["cal-day"]
      if (!d.inMonth) cls.push("other")
      if (d.iso === today) cls.push("today")
      const cell = new Gtk.Box({ heightRequest: 34, halign: Gtk.Align.CENTER })
      cell.append(
        new Gtk.Label({ label: String(d.day), cssClasses: cls, valign: Gtk.Align.CENTER }),
      )
      grid.attach(cell, i % 7, 1 + Math.floor(i / 7), 1, 1)
      days.push(cell)
    })
  }

  const step = (delta: number) => {
    month += delta
    if (month < 1) [month, year] = [12, year - 1]
    if (month > 12) [month, year] = [1, year + 1]
    render()
  }

  const reset = () => {
    const t = now()
    year = t.get_year()
    month = t.get_month()
    weekday.label = t.format("%A") ?? ""
    date.label = t.format("%-d %B %Y") ?? ""
    render()
  }

  return (
    <box
      class="cal-col"
      orientation={Gtk.Orientation.VERTICAL}
      spacing={10}
      $={() => {
        reset()
        onReady({ reset })
      }}
    >
      <box class="cal-head" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
        <label class="cal-weekday" xalign={0} $={(self) => (weekday = self)} />
        <label class="cal-date" xalign={0} $={(self) => (date = self)} />
      </box>
      <box class="cal-month">
        <label class="cal-title" hexpand xalign={0} $={(self) => (title = self)} />
        <button class="cal-nav" tooltipText="Previous month" onClicked={() => step(-1)}>
          <Icon name="chevron_left" />
        </button>
        <button class="cal-nav" tooltipText="Next month" onClicked={() => step(1)}>
          <Icon name="chevron_right" />
        </button>
      </box>
      <Gtk.Grid
        class="cal-grid"
        columnHomogeneous
        rowSpacing={2}
        $={(self) => {
          grid = self
          DAY_NAMES.forEach((d, i) =>
            self.attach(new Gtk.Label({ label: d, cssClasses: ["cal-dayname"] }), i, 0, 1, 1),
          )
          // scrolling over the month flips it, like the chevrons
          const scroll = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.VERTICAL | Gtk.EventControllerScrollFlags.DISCRETE,
          })
          scroll.connect("scroll", (_, _dx, dy) => {
            step(dy > 0 ? 1 : -1)
            return true
          })
          self.add_controller(scroll)
        }}
      />
    </box>
  )
}

import { Gdk, Gtk } from "ags/gtk4"
import { createState, onCleanup } from "ags"
import Pango from "gi://Pango"
import { asanaProblem, asanaTasks, openTask, setAsanaWeek, useAsana } from "../../../service/asana"
import { addDays, countsByDay, dayLabel, isOverdue, localDay, mondayOf, tasksForDay, weekOf, type AsanaTask } from "../../../service/asanaModel"
import { MOTION } from "../../common/motion"
import { isoDay } from "../dates"
import { editing } from "../state"
import { EmptyState, SeverityDot, box, label, onNewDay } from "./common"
import type { WidgetProps } from "./types"

// Your Asana tasks for the day picked on the week strip: due that day, and on today every open
// task that's overdue too. Finished ones sink to the bottom, struck. Read-only; a row opens the
// task in the browser. The picked day isn't saved: the widget always opens on today.

const ROWS = { m: 3, l: 9 } as const
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// "Yest", else "Mon": short enough for the time column
const shortDay = (iso: string, todayIso: string) =>
  dayLabel(iso, todayIso) === "Yesterday" ? "Yest" : SHORT[new Date(`${iso}T12:00:00`).getDay()]
const LETTERS = ["M", "T", "W", "T", "F", "S", "S"]

const flat = (cls: string, child: Gtk.Widget) => {
  const b = new Gtk.Button({ child, canFocus: false, focusOnClick: false })
  for (const c of cls.split(" ").filter(Boolean)) b.add_css_class(c)
  return b
}

const timeOf = (t: AsanaTask) => {
  if (!t.dueAt) return ""
  const d = new Date(t.dueAt)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export default function Asana(p: WidgetProps) {
  useAsana(p.live)
  const max = p.size === "l" ? ROWS.l : ROWS.m
  const act = (fn: () => void) => () => {
    if (!p.preview && !editing.get()) fn()
  }

  let today = isoDay(new Date())
  const [day, setDay] = createState(today)

  // ── header ────────────────────────────────────────────────────────────────
  const title = label("", "dw-eyebrow", { hexpand: true })
  const count = label("", "dw-sub dw-count", { xalign: 1 })
  const header = box("dw-tasks-header", false, 8, [title, count])

  // ── week strip ────────────────────────────────────────────────────────────
  const moveWeek = (by: number) => setDay(addDays(day.get(), 7 * by))
  const chevron = (glyph: string, by: number) => {
    const b = flat("dw-asana-chev", label(glyph, "glyph", { xalign: 0.5 }))
    b.connect("clicked", act(() => moveWeek(by)))
    return b
  }
  const cells = LETTERS.map((letter, i) => {
    const num = label("", "dw-asana-num", { xalign: 0.5 })
    const b = flat("dw-asana-cell", box("", false, 3, [label(letter, "dw-asana-letter"), num], { halign: Gtk.Align.CENTER }))
    b.hexpand = true
    b.connect("clicked", act(() => setDay(weekOf(day.get())[i])))
    return { b, num }
  })
  const strip = box("dw-asana-strip dw-nodrag", false, 2, [chevron("\uf053", -1), ...cells.map((c) => c.b), chevron("\uf054", 1)])
  // scrolling over the strip flips the week, like the bar's calendar
  const scroll = new Gtk.EventControllerScroll({
    flags: Gtk.EventControllerScrollFlags.VERTICAL | Gtk.EventControllerScrollFlags.DISCRETE,
  })
  scroll.connect("scroll", (_c, _dx, dy) => {
    act(() => moveWeek(dy > 0 ? 1 : -1))()
    return true
  })
  strip.add_controller(scroll)

  // ── list ──────────────────────────────────────────────────────────────────
  const list = box("dw-task-list", true, p.size === "l" ? 4 : 2, [], { vexpand: true, valign: Gtk.Align.START })
  const more = label("", "dw-sub dw-more")
  const stack = new Gtk.Stack({ transitionType: Gtk.StackTransitionType.CROSSFADE, transitionDuration: MOTION.base, vexpand: true })
  stack.add_named(list, "list")
  stack.add_named(EmptyState("\uf058", "Nothing due", "Enjoy the free day."), "clear")
  stack.add_named(EmptyState("\uf084", "Connect Asana", "secret-tool store --label='Asana PAT' service asana"), "no-token")
  stack.add_named(EmptyState("\uf023", "Token rejected", "Store a fresh Personal Access Token."), "auth")
  stack.add_named(EmptyState("\u{f05aa}", "Can't reach Asana", "Will try again shortly."), "offline")
  stack.add_named(EmptyState("\uf071", "Asana didn't answer", "Will try again shortly."), "error")
  stack.add_named(EmptyState("\uf254", "Loading…"), "loading")

  // dot: red when overdue, accent when open; the right column is the due time, or for an
  // overdue task the short day it was due
  const Row = (t: AsanaTask) => {
    const late = isOverdue(t, today)
    const meta = late ? shortDay(localDay(t)!, today) : timeOf(t)
    const row = box("dw-task-row", false, 8, [
      SeverityDot(late ? 5 : 3),
      label(t.name, "dw-task-title", { ellipsize: Pango.EllipsizeMode.END, hexpand: true }),
      label(meta, "dw-task-effort", { xalign: 1 }),
    ])
    if (t.completed) row.add_css_class("done")
    if (t.project) row.tooltipText = t.project
    row.cursor = Gdk.Cursor.new_from_name("pointer", null)
    const click = new Gtk.GestureClick()
    click.connect("released", act(() => openTask(t.url)))
    row.add_controller(click)
    return row
  }

  const render = () => {
    const d = day.get()
    const all = asanaTasks.get()
    const week = weekOf(d)
    title.label = `ASANA · ${dayLabel(d, today).toUpperCase()}`

    const counts = all ? countsByDay(all, week) : week.map(() => 0)
    week.forEach((iso, i) => {
      const c = cells[i]
      c.num.label = String(Number(iso.slice(8)))
      const flags = [["selected", iso === d], ["today", iso === today], ["empty", counts[i] === 0]] as const
      for (const [cls, on] of flags) {
        if (on) c.b.add_css_class(cls)
        else c.b.remove_css_class(cls)
      }
    })

    let ch
    while ((ch = list.get_first_child())) list.remove(ch)
    more.visible = false
    const problem = asanaProblem.get()
    if (!all) {
      count.label = ""
      stack.set_visible_child_name(problem ?? "loading")
      return
    }
    const shown = tasksForDay(all, d, today)
    const open = shown.filter((t) => !t.completed).length
    count.label = open === 1 ? "1 open" : `${open} open`
    // a token problem outranks stale data; a network blip doesn't
    if (problem === "no-token" || problem === "auth") {
      stack.set_visible_child_name(problem)
      return
    }
    if (!shown.length) {
      stack.set_visible_child_name("clear")
      return
    }
    stack.set_visible_child_name("list")
    for (const t of shown.slice(0, max)) list.append(Row(t))
    const rest = shown.length - Math.min(shown.length, max)
    more.label = `+${rest} more`
    more.visible = rest > 0
  }

  onCleanup(day.subscribe(() => setAsanaWeek(mondayOf(day.get()))))
  onCleanup(day.subscribe(render))
  onCleanup(asanaTasks.subscribe(render))
  onCleanup(asanaProblem.subscribe(render))
  onNewDay(() => {
    const was = today
    today = isoDay(new Date())
    if (day.get() === was) setDay(today) // you were on "today": follow it
    else render()
  })
  setAsanaWeek(mondayOf(today))
  render()

  return box(`dw-tasks dw-asana dw-asana-${p.size}`, true, 8, [header, strip, stack, more], { hexpand: true, vexpand: true })
}

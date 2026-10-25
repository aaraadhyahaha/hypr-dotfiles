import { Gtk } from "ags/gtk4"
import { onCleanup } from "ags"
import Pango from "gi://Pango"
import { fxProblem, fxStatus, openFx, useFx } from "../../../service/fx"
import { hm, type FxTask } from "../../../service/fxModel"
import { EmptyState, SeverityDot, box, label } from "./common"
import type { WidgetProps } from "./types"

// fx's task list for today, most important first; finished ones sink to the bottom, struck.
// Read-only. A click opens fx.

const ROWS = { m: 3, l: 9 } as const

function Row(t: FxTask) {
  const effort = t.minutes > 0 && !t.done ? `${hm(t.minutes)} / ${hm(t.effort)}` : hm(t.effort)
  const row = box("dw-task-row", false, 8, [
    SeverityDot(t.severity),
    label(t.title, "dw-task-title", { ellipsize: Pango.EllipsizeMode.END, hexpand: true }),
    label(effort, "dw-task-effort", { xalign: 1 }),
  ])
  if (t.done) row.add_css_class("done")
  return row
}

export default function FxTasks(p: WidgetProps) {
  useFx()
  const max = p.size === "l" ? ROWS.l : ROWS.m
  const count = label(
    fxStatus.as((s) => {
      const n = s?.tasks.filter((t) => !t.done).length ?? 0
      return n === 1 ? "1 open" : `${n} open`
    }),
    "dw-sub dw-count",
    { xalign: 1 },
  )
  const header = box("dw-tasks-header", false, 8, [label("TASKS", "dw-eyebrow", { hexpand: true }), count])
  const list = box("dw-task-list", true, p.size === "l" ? 4 : 2, [], { vexpand: true, valign: Gtk.Align.START })
  const more = label("", "dw-sub dw-more")

  const stack = new Gtk.Stack({ transitionType: Gtk.StackTransitionType.CROSSFADE, transitionDuration: 200, vexpand: true })
  stack.add_named(list, "list")
  stack.add_named(EmptyState("", "All clear", "Nothing on your list today."), "clear")
  stack.add_named(EmptyState("", "fx isn't installed", "Install it to see your tasks here."), "missing")

  const render = () => {
    const s = fxStatus.get()
    if (!s) {
      stack.set_visible_child_name(fxProblem.get() === "missing" ? "missing" : "list")
      return
    }
    let c
    while ((c = list.get_first_child())) list.remove(c)
    const tasks = s.tasks // fx orders them: open by severity, then finished
    if (!tasks.some((t) => !t.done)) {
      stack.set_visible_child_name("clear")
      more.visible = false
      return
    }
    stack.set_visible_child_name("list")
    const shown = tasks.slice(0, max)
    for (const t of shown) list.append(Row(t))
    const rest = tasks.filter((t) => !t.done).length - shown.filter((t) => !t.done).length
    more.label = `+${rest} more`
    more.visible = rest > 0
  }
  onCleanup(fxStatus.subscribe(render))
  onCleanup(fxProblem.subscribe(render))
  render()

  if (!p.preview) p.onActivate(openFx)
  return box(`dw-tasks dw-tasks-${p.size}`, true, 8, [header, stack, more], { hexpand: true, vexpand: true })
}

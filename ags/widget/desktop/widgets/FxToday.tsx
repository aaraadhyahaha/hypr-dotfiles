import { Gtk } from "ags/gtk4"
import { createComputed, onCleanup } from "ags"
import { createPoll } from "ags/time"
import { execAsync } from "ags/process"
import Pango from "gi://Pango"
import { fxProblem, fxStatus, useFx } from "../../../service/fx"
import { hm, sinceMinutes } from "../../../service/fxModel"
import { Bars, EmptyState, Meter, Ring, SeverityDot, box, label } from "./common"
import type { WidgetProps } from "./types"

// Today in fx: the day score as a ring, focus against the target, the streak, and (large) the
// hours you focused and what's up next. Read-only: fx owns the data.

const FLAME = ""
const STREAK_CLASS = { clean: "clean", bent: "bent", reset: "reset" } as const

function Streak() {
  const l = label(fxStatus.as((s) => `${s?.streak.days ?? 0}-day streak`), "dw-sub dw-streak-text")
  const g = label(FLAME, "glyph dw-streak-glyph")
  const row = box("dw-streak", false, 6, [g, l])
  const sync = () => {
    for (const c of Object.values(STREAK_CLASS)) row.remove_css_class(c)
    row.add_css_class(STREAK_CLASS[fxStatus.get()?.streak.status ?? "clean"])
  }
  onCleanup(fxStatus.subscribe(sync))
  sync()
  return row
}

function ScoreRing(size: number, width: number, big: boolean) {
  const n = label(fxStatus.as((s) => (s ? String(s.score) : "–")), big ? "dw-score dw-score-big" : "dw-score", { xalign: 0.5 })
  const kids: Gtk.Widget[] = [n]
  if (big) kids.push(label("score", "dw-ring-caption", { xalign: 0.5 }))
  return Ring({ size, width, frac: fxStatus.as((s) => (s ? s.score / 100 : 0)), cls: "dw-fx-ring", center: kids })
}

function FocusBlock() {
  const tick = createPoll(0, 30000, (n) => n + 1) // keeps "· 25m" moving between fx refreshes
  const focusLine = box("", false, 4, [
    label(fxStatus.as((s) => hm(s?.focusMin ?? 0)), "dw-focus-big"),
    label(fxStatus.as((s) => `of ${hm(s?.targetMin ?? 240)}`), "dw-sub dw-focus-of", { valign: Gtk.Align.BASELINE }),
  ])
  const active = createComputed(() => {
    tick()
    const s = fxStatus()
    if (!s?.active) return ""
    const what = s.active.title ?? "Untitled session"
    return `${what} · ${hm(sinceMinutes(s.active.since))}`
  })
  const now = box("dw-fx-now", false, 6, [
    label("", "glyph dw-live-dot"),
    label(active, "dw-fx-now-text", { ellipsize: Pango.EllipsizeMode.END, hexpand: true }),
  ])
  const idle = label("Not focusing", "dw-sub")
  const sync = () => {
    const on = !!active.get()
    now.visible = on
    idle.visible = !on
  }
  onCleanup(active.subscribe(sync))
  sync()
  return box("dw-fx-focus", true, 6, [
    label("FOCUS TODAY", "dw-eyebrow"),
    focusLine,
    Meter(fxStatus.as((s) => (s ? s.focusMin / Math.max(1, s.targetMin) : 0)), "dw-fx-meter"),
    now,
    idle,
  ], { valign: Gtk.Align.CENTER, hexpand: true })
}

function Hourly() {
  const values = fxStatus.as((s) => s?.hourly ?? [])
  const axis = box("dw-axis", false, 0, [
    label(fxStatus.as((s) => s?.window[0] ?? ""), "dw-axis-label", { hexpand: true }),
    label(fxStatus.as((s) => s?.window[1] ?? ""), "dw-axis-label", { xalign: 1 }),
  ])
  return box("dw-fx-hourly", true, 4, [label("FOCUS BY HOUR", "dw-eyebrow"), Bars(values, () => 60, 44, "dw-fx-bars"), axis])
}

function UpNext() {
  const list = box("dw-upnext-list", true, 2)
  const render = () => {
    let c
    while ((c = list.get_first_child())) list.remove(c)
    const open = (fxStatus.get()?.tasks ?? []).filter((t) => !t.done).slice(0, 3)
    if (!open.length) list.append(label("Nothing open. Nice.", "dw-sub"))
    for (const t of open)
      list.append(box("dw-task-row", false, 8, [SeverityDot(t.severity), label(t.title, "dw-task-title", { ellipsize: Pango.EllipsizeMode.END, hexpand: true })]))
  }
  onCleanup(fxStatus.subscribe(render))
  render()
  return box("dw-upnext", true, 4, [label("UP NEXT", "dw-eyebrow"), list])
}

export default function FxToday(p: WidgetProps) {
  useFx()
  const body = new Gtk.Stack({ transitionType: Gtk.StackTransitionType.CROSSFADE, transitionDuration: 200, hexpand: true, vexpand: true })

  const missing = EmptyState("", "fx isn't installed", "Install it to see your day here.")
  const content =
    p.size === "s"
      ? box("dw-fx-s", true, 6, [ScoreRing(92, 9, true), Streak()], { valign: Gtk.Align.CENTER, halign: Gtk.Align.CENTER })
      : p.size === "m"
        ? box("dw-fx-m", false, 16, [ScoreRing(104, 10, true), box("", true, 8, [FocusBlock(), Streak()], { valign: Gtk.Align.CENTER, hexpand: true })])
        : box("dw-fx-l", true, 12, [
            box("", false, 16, [ScoreRing(96, 9, true), box("", true, 6, [FocusBlock(), Streak()], { valign: Gtk.Align.CENTER, hexpand: true })]),
            Hourly(),
            UpNext(),
          ])
  body.add_named(content, "ok")
  body.add_named(missing, "missing")

  const sync = () => body.set_visible_child_name(!fxStatus.get() && fxProblem.get() === "missing" ? "missing" : "ok")
  onCleanup(fxStatus.subscribe(sync))
  onCleanup(fxProblem.subscribe(sync))
  sync()

  if (!p.preview) p.onActivate(openFx)
  return body
}

export const openFx = () => execAsync(["kitty", "--title", "fx", "fx"]).catch(console.error)

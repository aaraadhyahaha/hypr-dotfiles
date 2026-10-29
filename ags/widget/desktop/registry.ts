import { Gtk } from "ags/gtk4"
import { entry } from "./catalog"
import type { Config, WidgetProps } from "./widgets/types"
import Calendar from "./widgets/Calendar"
import Clock from "./widgets/Clock"
import Countdown, { editCountdown } from "./widgets/Countdown"
import FxTasks from "./widgets/FxTasks"
import FxToday from "./widgets/FxToday"
import Goal, { editGoal } from "./widgets/Goal"
import Note from "./widgets/Note"
import System from "./widgets/System"

// kind → how to draw it (and edit it). What each kind *is* (name, sizes…) lives in catalog.ts.

type Render = (p: WidgetProps) => unknown
type Editor = (anchor: Gtk.Widget, config: Config, set: (c: Config) => void) => Gtk.Popover

const RENDER: Record<string, Render> = {
  "fx-today": FxToday,
  "fx-tasks": FxTasks,
  clock: Clock,
  calendar: Calendar,
  system: System,
  note: Note,
  goal: Goal,
  countdown: Countdown,
}

const EDIT: Record<string, Editor> = {
  goal: editGoal,
  countdown: editCountdown,
}

export function render(kind: string, p: WidgetProps): Gtk.Widget {
  const r = RENDER[kind]
  if (r) return r(p) as Gtk.Widget
  const l = new Gtk.Label({ label: entry(kind)?.name ?? kind, hexpand: true, vexpand: true })
  l.add_css_class("dw-sub")
  return l
}

export const editorFor = (kind: string): Editor | undefined => EDIT[kind]

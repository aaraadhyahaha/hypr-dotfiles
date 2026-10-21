import { Gtk } from "ags/gtk4"
import { entry } from "./catalog"
import type { WidgetProps } from "./widgets/types"
import Clock from "./widgets/Clock"

// kind → how to draw it. What each kind *is* (name, sizes…) lives in catalog.ts.

type Render = (p: WidgetProps) => unknown

const RENDER: Record<string, Render> = {
  clock: Clock,
}

function placeholder(kind: string) {
  const l = new Gtk.Label({ label: entry(kind)?.name ?? kind, hexpand: true, vexpand: true })
  l.add_css_class("dw-sub")
  return l
}

export function render(kind: string, p: WidgetProps): Gtk.Widget {
  const r = RENDER[kind]
  return (r ? r(p) : placeholder(kind)) as Gtk.Widget
}

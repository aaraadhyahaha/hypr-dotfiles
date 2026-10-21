import { Gtk } from "ags/gtk4"
import { Motion, ENTER, onShow } from "../../common/motion"
import { box, label } from "./common"

// "Edit Widget…": a popover beside the widget with its fields. Changes apply as you type;
// Done (or clicking away) closes it.

export function editorPopover(anchor: Gtk.Widget, title: string, fields: Gtk.Widget[]) {
  const pop = new Gtk.Popover({ hasArrow: false, position: Gtk.PositionType.RIGHT })
  pop.add_css_class("dw-editor-pop")
  pop.set_parent(anchor)
  const m = new Motion({ origin: "top" })
  const done = new Gtk.Button({ label: "Done", halign: Gtk.Align.END })
  done.add_css_class("dw-done")
  done.connect("clicked", () => pop.popdown())
  m.append(box("dw-editor", true, 10, [label(title, "dw-editor-title"), ...fields, done]))
  pop.set_child(m)
  onShow(pop, m, ENTER.popover)
  // an editor is built per open; it goes away with its popover
  pop.connect("closed", () => queueMicrotask(() => pop.unparent()))
  pop.popup()
  return pop
}

export function field(name: string, value: string, onChange: (v: string) => void, placeholder = "") {
  const entry = new Gtk.Entry({ text: value, placeholderText: placeholder, hexpand: true })
  entry.add_css_class("dw-field")
  entry.connect("changed", () => onChange(entry.text))
  return box("dw-field-row", true, 4, [label(name, "dw-field-name"), entry])
}

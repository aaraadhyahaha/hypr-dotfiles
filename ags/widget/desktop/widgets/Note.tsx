import { Gtk } from "ags/gtk4"
import { onCleanup } from "ags"
import GLib from "gi://GLib"
import { label } from "./common"
import type { WidgetProps } from "./types"

// A sticky note tinted with the accent's container colour. Typing saves (debounced) into the
// widget's config, so it survives restarts.

const SAVE_MS = 500

export default function Note(p: WidgetProps) {
  const text = () => String(p.config.get().text ?? "")
  const buffer = new Gtk.TextBuffer({ text: text() })
  const view = new Gtk.TextView({
    buffer,
    wrapMode: Gtk.WrapMode.WORD_CHAR,
    hexpand: true,
    vexpand: true,
    acceptsTab: false,
    editable: !p.preview,
    cursorVisible: !p.preview,
  })
  view.add_css_class("dw-note-text")
  if (p.preview) view.set_can_target(false)

  const scroll = new Gtk.ScrolledWindow({
    child: view,
    hscrollbarPolicy: Gtk.PolicyType.NEVER,
    vscrollbarPolicy: Gtk.PolicyType.AUTOMATIC,
    hexpand: true,
    vexpand: true,
  })
  scroll.add_css_class("dw-note-scroll")

  const hint = label(p.preview ? "Jot something down." : "Write something…", "dw-note-hint", { valign: Gtk.Align.START })
  hint.set_can_target(false)
  const syncHint = () => (hint.visible = buffer.get_char_count() === 0)

  let pending = 0
  buffer.connect("changed", () => {
    syncHint()
    if (p.preview) return
    if (pending) GLib.source_remove(pending)
    pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_MS, () => {
      pending = 0
      const [start, end] = buffer.get_bounds()
      p.setConfig({ text: buffer.get_text(start, end, false) })
      return GLib.SOURCE_REMOVE
    })
  })
  // flush an unsaved edit if the widget goes away mid-typing
  onCleanup(() => {
    if (!pending) return
    GLib.source_remove(pending)
    const [start, end] = buffer.get_bounds()
    p.setConfig({ text: buffer.get_text(start, end, false) })
  })
  // another copy changed it (a restored layout): follow, but never under the cursor
  onCleanup(
    p.config.subscribe(() => {
      const [start, end] = buffer.get_bounds()
      if (!view.has_focus && text() !== buffer.get_text(start, end, false)) buffer.text = text()
    }),
  )
  syncHint()

  const o = new Gtk.Overlay({ child: scroll, hexpand: true, vexpand: true })
  o.add_overlay(hint)
  return o
}

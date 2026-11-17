import { Gtk, Gdk } from "ags/gtk4"
import Gio from "gi://Gio"
import GLib from "gi://GLib"
import { uriList } from "../launcher/filesModel"
import { fileIcon } from "../launcher/preview"

// Drag a file row into any window, like a file manager drag. COPY only: a drop must never move the file.
// The drag icon is a static themed-icon paintable on a Wayland drag-icon surface that the compositor
// moves, so AGS does no per-frame work during the drag.

const ICON_SIZE = 48

export type FileDragHandlers = {
  begin: () => void
  end: (dropped: boolean) => void
}

const bytes = (s: string) => new GLib.Bytes(new TextEncoder().encode(s))

export function attachFileDrag(row: Gtk.Widget, path: string, h: FileDragHandlers) {
  const source = new Gtk.DragSource({ actions: Gdk.DragAction.COPY })
  let cancelled = false

  source.connect("prepare", () => {
    const uri = Gio.File.new_for_path(path).get_uri()
    return Gdk.ContentProvider.new_union([
      Gdk.ContentProvider.new_for_bytes("text/uri-list", bytes(uriList([uri]))),
      Gdk.ContentProvider.new_for_bytes("text/plain;charset=utf-8", bytes(path)),
    ])
  })

  source.connect("drag-begin", () => {
    cancelled = false
    const theme = Gtk.IconTheme.get_for_display(row.get_display())
    const paintable = theme.lookup_by_gicon(
      fileIcon(path),
      ICON_SIZE,
      row.get_scale_factor(),
      row.get_direction(),
      0,
    )
    source.set_icon(paintable, ICON_SIZE / 2, ICON_SIZE / 2)
    h.begin()
  })

  source.connect("drag-cancel", () => {
    cancelled = true
    return false
  })

  source.connect("drag-end", () => h.end(!cancelled))

  row.add_controller(source)
  return source
}

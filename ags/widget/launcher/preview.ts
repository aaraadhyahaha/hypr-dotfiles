import { Gtk, Gdk } from "ags/gtk4"
import Gio from "gi://Gio"
import GLib from "gi://GLib"
import GObject from "gi://GObject"
import GdkPixbuf from "gi://GdkPixbuf"
import Pango from "gi://Pango"
import {
  type Recent,
  previewKind,
  looksBinary,
  firstLines,
  formatSize,
  relTime,
  itemCount,
  tildePath,
  fitSize,
} from "./filesModel"

// Launcher files mode: Gtk.RecentManager's list, file icons, and the preview pane's content.
// Everything that touches the disk is async and takes a Gio.Cancellable, so arrowing
// through results never stalls the launcher.

const HOME = GLib.get_home_dir()
// the visual area inside the pane (content box, px); the width matches .lnch.wide in _launcher.scss.
// Labels get width/maxWidthChars 1 so their natural width is ~0 and the pane never grows past it
export const PREVIEW_W = 288
const VISUAL_H = 260
const TEXT_CHUNK = 16 * 1024
const TEXT_LINES = 40
const DIR_SHOWN = 10
const DIR_CAP = 500
const PRIO = GLib.PRIORITY_DEFAULT

const INFO_ATTRS = [
  "standard::content-type",
  "standard::type",
  "standard::size",
  "time::modified",
].join(",")

// newest first, local files that still exist
export function listRecent(max: number): Recent[] {
  const out: Recent[] = []
  const items = Gtk.RecentManager.get_default()
    .get_items()
    .filter((i) => i.is_local())
    .sort((a, b) => b.get_modified().to_unix() - a.get_modified().to_unix())
  for (const i of items) {
    if (out.length >= max) break
    const path = Gio.File.new_for_uri(i.get_uri()).get_path()
    if (path && i.exists()) out.push({ path, modified: i.get_modified().to_unix() * 1000 })
  }
  return out
}

// opening from the launcher counts as using the file
export function addRecent(path: string) {
  if (GLib.file_test(path, GLib.FileTest.IS_REGULAR))
    Gtk.RecentManager.get_default().add_item(Gio.File.new_for_path(path).get_uri())
}

// by name only: one stat for folders, no file reads
export function fileIcon(path: string): Gio.Icon {
  if (GLib.file_test(path, GLib.FileTest.IS_DIR)) return Gio.content_type_get_icon("inode/directory")
  const [ct] = Gio.content_type_guess(path, null)
  return Gio.content_type_get_icon(ct)
}

const queryInfo = (f: Gio.File, cancel: Gio.Cancellable) =>
  new Promise<Gio.FileInfo>((ok, fail) =>
    f.query_info_async(INFO_ATTRS, Gio.FileQueryInfoFlags.NONE, PRIO, cancel, (_s, res) => {
      try { ok(f.query_info_finish(res)) } catch (e) { fail(e) }
    }))

const readHead = (f: Gio.File, cancel: Gio.Cancellable) =>
  new Promise<Uint8Array>((ok, fail) =>
    f.read_async(PRIO, cancel, (_s, res) => {
      let stream: Gio.FileInputStream
      try { stream = f.read_finish(res) } catch (e) { return fail(e) }
      stream.read_bytes_async(TEXT_CHUNK, PRIO, cancel, (_s2, res2) => {
        try { ok(stream.read_bytes_finish(res2).get_data() ?? new Uint8Array()) } catch (e) { fail(e) }
        finally { stream.close_async(PRIO, null, null) }
      })
    }))

// names (folders first, then A–Z, hidden ones skipped) and whether the count stopped at DIR_CAP
const listDir = (f: Gio.File, cancel: Gio.Cancellable) =>
  new Promise<{ entries: Gio.FileInfo[]; capped: boolean }>((ok, fail) =>
    f.enumerate_children_async(
      "standard::name,standard::display-name,standard::type,standard::is-hidden,standard::icon",
      Gio.FileQueryInfoFlags.NONE, PRIO, cancel,
      (_s, res) => {
        let en: Gio.FileEnumerator
        try { en = f.enumerate_children_finish(res) } catch (e) { return fail(e) }
        en.next_files_async(DIR_CAP + 1, PRIO, cancel, (_s2, res2) => {
          try {
            const all = en.next_files_finish(res2).filter((i) => !i.get_is_hidden())
            const isDir = (i: Gio.FileInfo) => i.get_file_type() === Gio.FileType.DIRECTORY
            all.sort((a, b) => Number(isDir(b)) - Number(isDir(a)) ||
              a.get_display_name().localeCompare(b.get_display_name()))
            ok({ entries: all.slice(0, DIR_CAP), capped: all.length > DIR_CAP })
          } catch (e) { fail(e) }
          finally { en.close_async(PRIO, null, null) }
        })
      }))

// decoded at the size it's shown, off the main loop (same approach as desktop.goal)
const loadImage = (path: string, scale: number, cancel: Gio.Cancellable) =>
  new Promise<{ tex: Gdk.Texture; w: number; h: number; iw: number; ih: number }>((ok, fail) => {
    const [, iw, ih] = GdkPixbuf.Pixbuf.get_file_info(path)
    if (!iw || !ih) return fail(new Error("not an image"))
    const [w, h] = fitSize(iw, ih, PREVIEW_W, VISUAL_H)
    // decoded at the device scale so it stays sharp on HiDPI
    const [dw, dh] = fitSize(iw, ih, w * scale, h * scale)
    let stream: Gio.FileInputStream
    try { stream = Gio.File.new_for_path(path).read(cancel) } catch (e) { return fail(e) }
    GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(stream, dw, dh, true, cancel, (_s, res) => {
      try { ok({ tex: Gdk.Texture.new_for_pixbuf(GdkPixbuf.Pixbuf.new_from_stream_finish(res)!), w, h, iw, ih }) }
      catch (e) { fail(e) }
      finally { stream.close(null) }
    })
  })

// a Picture whose size is its size request: a plain one asks for the texture's pixel size,
// which for a HiDPI decode is twice the space it should take
const FitPicture = GObject.registerClass(
  { GTypeName: "AgsFitPicture" },
  class FitPicture extends Gtk.Picture {
    vfunc_measure(o: Gtk.Orientation, _for: number): [number, number, number, number] {
      const s = o === Gtk.Orientation.HORIZONTAL ? this.widthRequest : this.heightRequest
      return [s, s, -1, -1]
    }
  },
)

const label = (text: string, cls: string, props: Partial<Gtk.Label.ConstructorProps> = {}) => {
  const l = new Gtk.Label({ label: text, xalign: 0, ...props })
  l.add_css_class(cls)
  return l
}

// the visual area: always VISUAL_H tall, so the text below never moves
const visualBox = (cls: string) => {
  const b = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, heightRequest: VISUAL_H, widthRequest: PREVIEW_W })
  b.add_css_class("lnch-preview-visual")
  b.add_css_class(cls)
  return b
}

const iconVisual = (gicon: Gio.Icon) => {
  const v = visualBox("icon")
  v.append(new Gtk.Image({ gicon, pixelSize: 96, vexpand: true, valign: Gtk.Align.CENTER }))
  return v
}

// name, kind · size, modified, and where it lives
function details(path: string, lines: string[]) {
  const b = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 })
  b.add_css_class("lnch-preview-details")
  b.append(label(GLib.path_get_basename(path) || path, "name", {
    widthChars: 1, maxWidthChars: 1, ellipsize: Pango.EllipsizeMode.MIDDLE, wrap: false,
  }))
  for (const l of lines) b.append(label(l, "meta", { widthChars: 1, maxWidthChars: 1, ellipsize: Pango.EllipsizeMode.END }))
  b.append(label(tildePath(GLib.path_get_dirname(path), HOME), "where", {
    widthChars: 1, maxWidthChars: 1, ellipsize: Pango.EllipsizeMode.MIDDLE,
  }))
  return b
}

function pane(visual: Gtk.Widget, path: string, lines: string[]) {
  const b = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12 })
  b.append(visual)
  b.append(details(path, lines))
  return b
}

// a placeholder for rows with nothing to show (empty states)
export function emptyPreview(symbol: string, text: string): Gtk.Widget {
  const v = visualBox("empty")
  const s = new Gtk.Label({ label: symbol, vexpand: true, valign: Gtk.Align.END })
  s.add_css_class("icon")
  s.add_css_class("symbol")
  v.append(s)
  v.append(label(text, "hint", { xalign: 0.5, vexpand: true, valign: Gtk.Align.START, wrap: true, justify: Gtk.Justification.CENTER }))
  return v
}

async function textVisual(f: Gio.File, cancel: Gio.Cancellable): Promise<Gtk.Widget | null> {
  const head = await readHead(f, cancel)
  if (looksBinary(head)) return null
  const text = firstLines(new TextDecoder("utf-8", { fatal: false }).decode(head), TEXT_LINES)
  const v = visualBox("text")
  if (!text) {
    v.append(label("Empty file", "hint", { xalign: 0.5, vexpand: true }))
    return v
  }
  // EXTERNAL: clipped to the visual area with no scrollbar; each line ellipsizes on its own
  const sw = new Gtk.ScrolledWindow({
    hscrollbarPolicy: Gtk.PolicyType.NEVER, vscrollbarPolicy: Gtk.PolicyType.EXTERNAL, vexpand: true,
  })
  sw.set_child(label(text, "code", {
    yalign: 0, widthChars: 1, maxWidthChars: 1, hexpand: true, ellipsize: Pango.EllipsizeMode.END, selectable: false,
  }))
  v.append(sw)
  return v
}

async function dirVisual(f: Gio.File, cancel: Gio.Cancellable) {
  const { entries, capped } = await listDir(f, cancel)
  const v = visualBox("dir")
  if (!entries.length) {
    v.append(label("Empty folder", "hint", { xalign: 0.5, vexpand: true }))
    return { v, count: itemCount(0, false) }
  }
  for (const e of entries.slice(0, DIR_SHOWN)) {
    const row = new Gtk.Box({ spacing: 8 })
    row.add_css_class("entry")
    const icon = e.get_icon()
    if (icon) row.append(new Gtk.Image({ gicon: icon, pixelSize: 16 }))
    row.append(label(e.get_display_name(), "entry-name", { widthChars: 1, maxWidthChars: 1, hexpand: true, ellipsize: Pango.EllipsizeMode.MIDDLE }))
    v.append(row)
  }
  if (entries.length > DIR_SHOWN) v.append(label(`and ${entries.length - DIR_SHOWN}${capped ? "+" : ""} more`, "hint"))
  return { v, count: itemCount(entries.length, capped) }
}

// the pane for one path; rejects when cancelled or unreadable (the caller shows a fallback).
// `scale`: the window's scale factor
export async function loadPreview(path: string, scale: number, cancel: Gio.Cancellable): Promise<Gtk.Widget> {
  const f = Gio.File.new_for_path(path)
  const info = await queryInfo(f, cancel)
  const isDir = info.get_file_type() === Gio.FileType.DIRECTORY
  const ct = info.get_content_type() ?? "application/octet-stream"
  const kind = previewKind(ct, isDir, Gio.content_type_is_a)
  const modified = info.get_modification_date_time()
  const when = modified ? `Modified ${relTime(modified.to_unix() * 1000, Date.now())}` : ""
  const desc = Gio.content_type_get_description(ct)
  const icon = Gio.content_type_get_icon(isDir ? "inode/directory" : ct)

  if (kind === "dir") {
    const { v, count } = await dirVisual(f, cancel)
    return pane(v, path, [`Folder · ${count}`, when].filter(Boolean))
  }
  const meta = `${desc} · ${formatSize(info.get_size())}`
  if (kind === "image") {
    try {
      const img = await loadImage(path, scale, cancel)
      const v = visualBox("image")
      const pic = new FitPicture({
        paintable: img.tex, contentFit: Gtk.ContentFit.FILL, canShrink: true,
        widthRequest: img.w, heightRequest: img.h,
        halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER, vexpand: true,
      })
      pic.overflow = Gtk.Overflow.HIDDEN
      pic.add_css_class("pic")
      v.append(pic)
      return pane(v, path, [`${meta} · ${img.iw}×${img.ih}`, when].filter(Boolean))
    } catch (e) {
      if (cancel.is_cancelled()) throw e
      // a format GdkPixbuf can't read: fall through to the icon
    }
  }
  if (kind === "text") {
    const v = await textVisual(f, cancel)
    if (v) return pane(v, path, [meta, when].filter(Boolean))
  }
  return pane(iconVisual(icon), path, [meta, when].filter(Boolean))
}

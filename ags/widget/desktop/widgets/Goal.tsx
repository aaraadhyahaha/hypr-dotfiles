import { Gdk, Gtk } from "ags/gtk4"
import { onCleanup } from "ags"
import Gio from "gi://Gio"
import GLib from "gi://GLib"
import GdkPixbuf from "gi://GdkPixbuf"
import Pango from "gi://Pango"
import { sizePx } from "../layout"
import { EmptyState, box, label } from "./common"
import { editorPopover, field } from "./editor"
import type { Config, WidgetProps } from "./types"

// Vision: a picture of where you're headed, with a title and caption over a soft scrim.

const str = (v: unknown) => (typeof v === "string" ? v : "")

// decode at the size it's shown (cover), off the main loop, so a 24MP photo never stalls the desktop
function loadCover(path: string, w: number, h: number, done: (t: Gdk.Texture | null) => void) {
  try {
    const [, iw, ih] = GdkPixbuf.Pixbuf.get_file_info(path)
    if (!iw || !ih) return done(null)
    const scale = Math.min(1, Math.max(w / iw, h / ih))
    const stream = Gio.File.new_for_path(path).read(null)
    GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(
      stream,
      Math.round(iw * scale),
      Math.round(ih * scale),
      true,
      null,
      (_src, res) => {
        try {
          const pb = GdkPixbuf.Pixbuf.new_from_stream_finish(res)
          done(Gdk.Texture.new_for_pixbuf(pb))
        } catch (e) {
          console.error("goal: can't decode", path, e)
          done(null)
        } finally {
          stream.close(null)
        }
      },
    )
  } catch (e) {
    console.error("goal: can't open", path, e)
    done(null)
  }
}

export default function Goal(p: WidgetProps) {
  const pic = new Gtk.Picture({ contentFit: Gtk.ContentFit.COVER, hexpand: true, vexpand: true })
  pic.add_css_class("dw-goal-pic")
  // the gradient fills the whole card; the hint sits in its middle
  const hint = p.preview || p.size === "s" ? "" : "Right-click → Edit Widget…"
  const empty = box("dw-goal-empty", true, 0, [EmptyState("", "Add a picture", hint)], { hexpand: true, vexpand: true })

  const title = label("", "dw-goal-title", { wrap: true, lines: 2, ellipsize: Pango.EllipsizeMode.END })
  const caption = label("", "dw-goal-caption", { wrap: true, lines: 2, ellipsize: Pango.EllipsizeMode.END })
  const scrim = box("dw-goal-scrim", true, 2, [title, caption], { valign: Gtk.Align.END, hexpand: true })

  const stack = new Gtk.Stack({ transitionType: Gtk.StackTransitionType.CROSSFADE, transitionDuration: 300, hexpand: true, vexpand: true })
  stack.add_named(empty, "empty")
  stack.add_named(pic, "pic")

  const { w, h } = sizePx(p.size)
  let shown = ""
  const sync = () => {
    const c = p.config.get()
    title.label = str(c.title)
    caption.label = str(c.caption)
    title.visible = !!title.label
    caption.visible = !!caption.label
    scrim.visible = title.visible || caption.visible
    const path = str(c.image)
    if (path === shown) return
    shown = path
    if (!path || !GLib.file_test(path, GLib.FileTest.EXISTS)) {
      stack.set_visible_child_name("empty")
      return
    }
    // 2x for the 1.25 fractional scale (GTK renders at the next integer scale)
    loadCover(path, w * 2, h * 2, (t) => {
      if (shown !== path) return
      pic.set_paintable(t)
      stack.set_visible_child_name(t ? "pic" : "empty")
    })
  }
  onCleanup(p.config.subscribe(sync))
  sync()

  const o = new Gtk.Overlay({ child: stack, hexpand: true, vexpand: true })
  o.add_overlay(scrim)
  return o
}

export function editGoal(anchor: Gtk.Widget, config: Config, set: (c: Config) => void) {
  const pick = new Gtk.Button({ label: config.image ? "Change Picture…" : "Choose Picture…", hexpand: true })
  pick.add_css_class("dw-button")
  const clear = new Gtk.Button({ label: "Remove", visible: !!config.image })
  clear.add_css_class("dw-button")
  clear.connect("clicked", () => {
    set({ image: "" })
    clear.visible = false
    pick.label = "Choose Picture…"
  })
  pick.connect("clicked", () => {
    const filter = new Gtk.FileFilter({ name: "Images" })
    filter.add_mime_type("image/*")
    const filters = new Gio.ListStore({ itemType: Gtk.FileFilter.$gtype })
    filters.append(filter)
    const dialog = new Gtk.FileDialog({
      title: "Choose a Picture",
      filters,
      initialFolder: Gio.File.new_for_path(`${GLib.get_home_dir()}/Pictures`),
    })
    dialog.open(null, null, (_d, res) => {
      try {
        const f = dialog.open_finish(res)
        const path = f?.get_path()
        if (!path) return
        set({ image: path })
        clear.visible = true
        pick.label = "Change Picture…"
      } catch {
        // dismissed
      }
    })
  })
  return editorPopover(anchor, "Goal", [
    field("Title", str(config.title), (v) => set({ title: v }), "What you're working towards"),
    field("Caption", str(config.caption), (v) => set({ caption: v }), "Why it matters"),
    box("dw-field-row", false, 8, [pick, clear]),
  ])
}

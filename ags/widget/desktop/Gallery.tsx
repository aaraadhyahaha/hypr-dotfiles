import { Gdk, Gtk } from "ags/gtk4"
import { createState, type Accessor } from "ags"
import GObject from "gi://GObject"
import GLib from "gi://GLib"
import Graphene from "gi://Graphene"
import Gsk from "gi://Gsk"
import { Motion, EASE, MOTION } from "../common/motion"
import { CATALOG, CATEGORIES, SIZE_NAMES, search, type Category, type Entry } from "./catalog"
import { previewCard } from "./Frame"
import { sizePx, type Size } from "./layout"
import { readFileOr, WALL_FILE } from "../bar/quicksettings/theme"
import type { Config } from "./widgets/types"

// The Widget Gallery: a sheet along the bottom of the desktop in edit mode. Categories on the
// left, search, and a live preview of every kind at the size you pick. Click a preview to add it
// at the first free spot, or drag it onto the desktop to place it.

export const PREVIEW_SCALE = 0.6

// draws (and hit-tests) its child at `scale`, laid out at full size: an honest miniature
const Scaled = GObject.registerClass(
  { GTypeName: "AgsScaled" },
  class Scaled extends Gtk.Widget {
    declare _child: Gtk.Widget
    declare _scale: number

    constructor(child: Gtk.Widget, scale: number) {
      super()
      this._child = child
      this._scale = scale
      child.set_parent(this)
    }

    // a card's size is its size request; its natural width can be far wider (ellipsized text)
    full(): [number, number] {
      const [w, h] = this._child.get_size_request()
      if (w > 0 && h > 0) return [w, h]
      return [this._child.measure(Gtk.Orientation.HORIZONTAL, -1)[1], this._child.measure(Gtk.Orientation.VERTICAL, -1)[1]]
    }

    vfunc_measure(o: Gtk.Orientation, _for: number): [number, number, number, number] {
      const [w, h] = this.full()
      const v = Math.ceil((o === Gtk.Orientation.HORIZONTAL ? w : h) * this._scale)
      return [v, v, -1, -1]
    }

    vfunc_size_allocate(_w: number, _h: number, _b: number) {
      const [w, h] = this.full()
      this._child.allocate(w, h, -1, new Gsk.Transform().scale(this._scale, this._scale))
    }

    vfunc_dispose() {
      this._child?.unparent()
      super.vfunc_dispose()
    }
  },
)

// what a kind shows in the gallery before you've configured it
export function sampleConfig(e: Entry): Config {
  const base = e.defaultConfig?.() ?? {}
  if (e.kind === "goal") return { ...base, image: readFileOr(WALL_FILE, ""), title: "Your next chapter", caption: "Pin a picture of where you're headed" }
  return base
}

export type GalleryDrag = {
  // x, y: pointer in the desktop's coordinates; fx, fy: where in the card it was grabbed (0..1)
  begin(kind: string, size: Size, config: Config, x: number, y: number, fx: number, fy: number): void
  move(x: number, y: number): void
  end(x: number, y: number): void
}

export function Gallery(opts: {
  live: Accessor<boolean>
  desktop: Gtk.Widget
  add(kind: string, size: Size, config: Config): boolean
  drag: GalleryDrag
  done(): void
}) {
  const [category, setCategory] = createState<Category | "all">("all")
  const [query, setQuery] = createState("")

  // ── one tile per kind, previews built once per size and kept ──────────────
  const tiles = new Map<string, Gtk.Widget>()
  const tileFor = (e: Entry) => {
    const config = sampleConfig(e)
    let size: Size = e.defaultSize
    const stack = new Gtk.Stack({
      transitionType: Gtk.StackTransitionType.CROSSFADE,
      transitionDuration: MOTION.base,
      interpolateSize: true,
      hhomogeneous: false,
      vhomogeneous: false,
      valign: Gtk.Align.END,
      halign: Gtk.Align.START,
    })
    const built = new Set<Size>()
    const show = (s: Size) => {
      if (!built.has(s)) {
        // kept for the gallery's lifetime, so never disposed
        stack.add_named(new Scaled(previewCard(e.kind, s, config, opts.live).card, PREVIEW_SCALE), s)
        built.add(s)
      }
      stack.set_visible_child_name(s)
    }
    show(size)

    const preview = new Gtk.Box({ valign: Gtk.Align.END })
    preview.add_css_class("dw-gal-preview")
    preview.append(stack)
    preview.set_cursor(Gdk.Cursor.new_from_name("grab", null))
    preview.set_tooltip_text(`Click to add, or drag onto the desktop`)

    const flashFull = () => {
      preview.add_css_class("full")
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 700, () => {
        preview.remove_css_class("full")
        return GLib.SOURCE_REMOVE
      })
    }

    // click adds; drag places
    const g = new Gtk.GestureDrag({ button: Gdk.BUTTON_PRIMARY })
    let dragging = false
    let gx = 0
    let gy = 0
    g.connect("drag-begin", (_g, x, y) => {
      dragging = false
      gx = x
      gy = y
    })
    g.connect("drag-update", (gest, dx, dy) => {
      const p = preview.compute_point(opts.desktop, new Graphene.Point({ x: gx + dx, y: gy + dy }))[1]
      if (!dragging) {
        if (Math.hypot(dx, dy) < 6) return
        dragging = true
        gest.set_state(Gtk.EventSequenceState.CLAIMED)
        const { w, h } = sizePx(size)
        const bw = w * PREVIEW_SCALE
        const bh = h * PREVIEW_SCALE
        // the preview sits at the bottom-left of its box
        const top = preview.get_height() - bh
        opts.drag.begin(e.kind, size, sampleConfig(e), p.x, p.y, Math.max(0, Math.min(1, gx / bw)), Math.max(0, Math.min(1, (gy - top) / bh)))
      }
      opts.drag.move(p.x, p.y)
    })
    g.connect("drag-end", (_g, dx, dy) => {
      const p = preview.compute_point(opts.desktop, new Graphene.Point({ x: gx + dx, y: gy + dy }))[1]
      if (dragging) opts.drag.end(p.x, p.y)
      // a fresh config: a countdown added days later counts from that day
      else if (Math.hypot(dx, dy) < 6 && !opts.add(e.kind, size, sampleConfig(e))) flashFull()
      dragging = false
    })
    preview.add_controller(g)

    // S M L XL
    const seg = new Gtk.Box({ halign: Gtk.Align.START })
    seg.add_css_class("dw-gal-sizes")
    const buttons: Gtk.Button[] = []
    for (const s of e.sizes) {
      const b = new Gtk.Button({ label: s.toUpperCase(), tooltipText: SIZE_NAMES[s] })
      b.add_css_class("dw-size")
      if (s === size) b.add_css_class("on")
      b.connect("clicked", () => {
        size = s
        for (const x of buttons) x.remove_css_class("on")
        b.add_css_class("on")
        show(s)
      })
      buttons.push(b)
      seg.append(b)
    }
    seg.visible = e.sizes.length > 1

    const name = new Gtk.Label({ label: e.name, xalign: 0 })
    name.add_css_class("dw-gal-name")
    const desc = new Gtk.Label({ label: e.description, xalign: 0, wrap: true, maxWidthChars: 28 })
    desc.add_css_class("dw-gal-desc")

    const tile = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, valign: Gtk.Align.END })
    tile.add_css_class("dw-gal-tile")
    tile.append(preview)
    tile.append(name)
    tile.append(desc)
    tile.append(seg)
    return tile
  }

  const row = new Gtk.Box({ spacing: 28, valign: Gtk.Align.END })
  row.add_css_class("dw-gal-row")
  const empty = new Gtk.Label({ label: "No widgets match.", hexpand: true })
  empty.add_css_class("dw-sub")
  const refresh = () => {
    let c
    while ((c = row.get_first_child())) row.remove(c)
    const q = query.get()
    const cat = category.get()
    const list = q ? search(q) : CATALOG.filter((e) => cat === "all" || e.category === cat)
    for (const e of list) {
      if (!tiles.has(e.kind)) tiles.set(e.kind, tileFor(e))
      row.append(tiles.get(e.kind)!)
    }
    if (!list.length) row.append(empty)
  }
  category.subscribe(refresh)
  query.subscribe(refresh)
  refresh()

  const scroll = new Gtk.ScrolledWindow({
    child: row,
    hscrollbarPolicy: Gtk.PolicyType.AUTOMATIC,
    vscrollbarPolicy: Gtk.PolicyType.NEVER,
    hexpand: true,
    vexpand: true,
  })
  scroll.add_css_class("dw-gal-scroll")

  // ── sidebar: search + categories ─────────────────────────────────────────
  const entry = new Gtk.SearchEntry({ placeholderText: "Search widgets" })
  entry.add_css_class("dw-gal-search")
  entry.connect("search-changed", () => setQuery(entry.text))

  const cats = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 })
  const catButtons = new Map<string, Gtk.Button>()
  const syncCats = () => {
    for (const [id, b] of catButtons)
      if (id === category.get() && !query.get()) b.add_css_class("selected")
      else b.remove_css_class("selected")
  }
  for (const c of [{ id: "all" as const, name: "All Widgets", glyph: "" }, ...CATEGORIES]) {
    const b = new Gtk.Button()
    b.add_css_class("dw-gal-cat")
    const inner = new Gtk.Box({ spacing: 10 })
    const g = new Gtk.Label({ label: c.glyph })
    g.add_css_class("glyph")
    inner.append(g)
    inner.append(new Gtk.Label({ label: c.name, xalign: 0, hexpand: true }))
    b.set_child(inner)
    b.connect("clicked", () => {
      entry.text = ""
      setCategory(c.id)
    })
    catButtons.set(c.id, b)
    cats.append(b)
  }
  category.subscribe(syncCats)
  query.subscribe(syncCats)
  syncCats()

  // the search entry asks to expand; the sidebar must not take the spare width from the previews
  const side = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, hexpand: false })
  side.set_hexpand(false)
  side.add_css_class("dw-gal-side")
  side.append(entry)
  side.append(cats)

  const done = new Gtk.Button({ label: "Done", valign: Gtk.Align.START })
  done.add_css_class("dw-done")
  done.connect("clicked", opts.done)
  const title = new Gtk.Label({ label: "Widgets", xalign: 0, hexpand: true })
  title.add_css_class("dw-gal-title")
  const head = new Gtk.Box()
  head.append(title)
  head.append(done)

  const main = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8, hexpand: true })
  main.append(head)
  main.append(scroll)

  const sheet = new Gtk.Box({ spacing: 20 })
  sheet.add_css_class("dw-gallery")
  sheet.append(side)
  sheet.append(main)

  const motion = new Motion({ halign: Gtk.Align.CENTER, valign: Gtk.Align.END })
  motion.add_css_class("dw-gallery-wrap")
  motion.append(sheet)
  motion.visible = false

  return {
    widget: motion as Gtk.Widget,
    sheet: sheet as Gtk.Widget,
    open() {
      motion.visible = true
      motion.animate({ from: { y: 56, opacity: 0 }, duration: MOTION.enter, ease: EASE.out })
      entry.grab_focus()
    },
    close() {
      motion.visible = false
      entry.text = ""
    },
    // fade back while a widget is dragged out, so the desktop under it shows
    dim(on: boolean) {
      motion.animate({ to: { opacity: on ? 0.25 : 1, y: on ? 24 : 0 }, duration: MOTION.base, ease: EASE.out })
    },
  }
}

import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { createRoot } from "ags"
import GObject from "gi://GObject"
import GLib from "gi://GLib"
import Graphene from "gi://Graphene"
import { Motion, ENTER, LIFT, MOTION, EASE, onShow } from "../common/motion"
import { toggleWallpapers } from "../wallpapers/Wallpapers"
import { cellToPx, gridFor, pxToCell, sizePx, type Cell, type Size } from "./layout"
import { SIZE_NAMES } from "./catalog"
import { createFrame, previewCard, type Frame, type Ghost, type Host } from "./Frame"
import { Gallery, PREVIEW_SCALE } from "./Gallery"
import { editing, setEditing } from "./state"
import * as store from "./store"

// The desktop: one full-screen layer under the windows (layer BOTTOM, inside the bar's exclusive
// zone) holding every widget on a snapping grid. Edit mode lifts it above the windows (TOP),
// dims them behind a scrim, shows remove badges, and opens the gallery.

export const toggleEditWidgets = () => setEditing(!editing.get())

// tells the store the real grid once the surface is allocated (and whenever it changes).
// Checked at snapshot: GTK never calls size_allocate on a widget with a layout manager, as Fixed has.
const DesktopFixed = GObject.registerClass(
  { GTypeName: "AgsDesktopFixed" },
  class DesktopFixed extends Gtk.Fixed {
    declare _w: number
    declare _h: number
    vfunc_snapshot(snapshot: Gtk.Snapshot) {
      super.vfunc_snapshot(snapshot)
      const w = this.get_width()
      const h = this.get_height()
      if (w === this._w && h === this._h) return
      this._w = w
      this._h = h
      // never change children from inside a snapshot
      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        store.setGrid(gridFor(w, h))
        return GLib.SOURCE_REMOVE
      })
    }
  },
)

function createGhost(fixed: Gtk.Fixed): Ghost {
  const motion = new Motion()
  const box = new Gtk.Box({ hexpand: false, vexpand: false })
  box.add_css_class("dw-ghost")
  const label = new Gtk.Label({ hexpand: true, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER })
  label.add_css_class("dw-ghost-size")
  box.append(label)
  motion.append(box)
  motion.visible = false
  motion.set_can_target(false)
  fixed.put(motion, 0, 0)
  let at: Cell | null = null
  let size: Size | null = null
  return {
    show(cell, s, blocked = false) {
      if (blocked) box.add_css_class("blocked")
      else box.remove_css_class("blocked")
      if (at && size === s && at.col === cell.col && at.row === cell.row && motion.visible) return
      const to = cellToPx(store.getGrid(), cell.col, cell.row)
      const { w, h } = sizePx(s, store.getGrid())
      box.set_size_request(w, h)
      label.label = SIZE_NAMES[s]
      fixed.move(motion, to.x, to.y)
      if (motion.visible && at && size === s) {
        // glide between cells instead of jumping
        const from = cellToPx(store.getGrid(), at.col, at.row)
        motion.animate({ from: { x: from.x - to.x, y: from.y - to.y }, duration: MOTION.fast * 1.6, ease: EASE.out })
      } else {
        motion.set({})
      }
      at = cell
      size = s
      motion.visible = true
    },
    hide() {
      motion.visible = false
      at = null
      size = null
    },
  }
}

function desktopMenu(parent: Gtk.Widget) {
  const pop = new Gtk.Popover({ hasArrow: false })
  pop.add_css_class("dw-menu-pop")
  pop.set_parent(parent)
  const m = new Motion({ origin: "top" })
  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
  box.add_css_class("menu")
  m.append(box)
  pop.set_child(m)
  onShow(pop, m, ENTER.popover)
  const row = (text: string, g: string, fn: () => void) => {
    const b = new Gtk.Button()
    b.add_css_class("menu-item")
    const inner = new Gtk.Box()
    const icon = new Gtk.Label({ label: g })
    icon.add_css_class("glyph")
    inner.append(icon)
    inner.append(new Gtk.Label({ label: text, xalign: 0, hexpand: true }))
    b.set_child(inner)
    b.connect("clicked", () => {
      pop.popdown()
      fn()
    })
    box.append(b)
  }
  row("Edit Widgets", "", () => setEditing(true))
  row("Change Wallpaper", "", () => toggleWallpapers())
  return pop
}

export default function Desktop() {
  const { TOP, LEFT, RIGHT, BOTTOM } = Astal.WindowAnchor
  const fixed = new DesktopFixed()
  fixed.add_css_class("dw-desktop")
  const ghost = createGhost(fixed)
  const host: Host = {
    fixed,
    ghost,
    // drawing order is child order: move to the end to draw above the rest
    raise: (w) => w.insert_before(fixed, null),
  }

  const frames = new Map<string, { frame: Frame; dispose: () => void }>()
  let first = true
  const sync = () => {
    const list = store.items.get()
    const seen = new Set<string>()
    for (const it of list) {
      seen.add(it.id)
      const f = frames.get(it.id)
      if (f) {
        f.frame.update(it)
        continue
      }
      createRoot((dispose) => {
        const frame = createFrame(host, it, { animateIn: !first })
        frames.set(it.id, { frame, dispose })
      })
    }
    for (const [id, f] of frames)
      if (!seen.has(id)) {
        f.frame.destroy()
        f.dispose()
        frames.delete(id)
      }
    first = false
  }
  store.items.subscribe(sync)
  sync()

  // clicks that land on the desktop itself, not on a widget
  const onEmpty = (x: number, y: number) => {
    const w = fixed.pick(x, y, Gtk.PickFlags.DEFAULT)
    return w === fixed || w === null
  }
  let menu: Gtk.Popover | null = null
  const right = new Gtk.GestureClick({ button: Gdk.BUTTON_SECONDARY })
  right.connect("pressed", (g, _n, x, y) => {
    if (!onEmpty(x, y)) return
    g.set_state(Gtk.EventSequenceState.CLAIMED)
    menu ??= desktopMenu(fixed)
    menu.set_pointing_to(new Gdk.Rectangle({ x: Math.round(x), y: Math.round(y), width: 1, height: 1 }))
    menu.popup()
  })
  fixed.add_controller(right)
  const left = new Gtk.GestureClick({ button: Gdk.BUTTON_PRIMARY })
  left.connect("released", (_g, _n, x, y) => {
    if (editing.get() && onEmpty(x, y)) setEditing(false)
  })
  fixed.add_controller(left)

  // ── the gallery, and widgets dragged out of it ────────────────────────────
  type Proxy = { m: Motion; dispose: () => void; w: number; h: number; fx: number; fy: number; size: Size; kind: string; config: Record<string, unknown> }
  let proxy: Proxy | null = null
  const drop = (p: Proxy) => {
    fixed.remove(p.m)
    p.dispose()
  }
  const proxyAt = (x: number, y: number) => ({ left: x - proxy!.fx * proxy!.w, top: y - proxy!.fy * proxy!.h })
  const overSheet = (x: number, y: number) => {
    const [ok, r] = gallery.sheet.compute_bounds(fixed)
    return ok && r.contains_point(new Graphene.Point({ x, y }))
  }
  const gallery = Gallery({
    // miniatures animate only while the gallery is open
    live: editing,
    desktop: fixed,
    add: (kind, size, config) => store.add(kind, size, undefined, config) !== null,
    done: () => setEditing(false),
    drag: {
      begin(kind, size, config, x, y, fx, fy) {
        const { w, h } = sizePx(size, store.getGrid())
        const m = new Motion()
        const { card, dispose } = previewCard(kind, size, config, editing, store.getGrid())
        m.append(card)
        m.set_can_target(false)
        proxy = { m, dispose, w, h, fx, fy, size, kind, config }
        const { left, top } = proxyAt(x, y)
        fixed.put(m, left, top)
        // grow from the preview's scale about the grab point (the pivot is the centre: offset it)
        const k = (s: number) => ({ x: (fx * w - w / 2) * (1 - s), y: (fy * h - h / 2) * (1 - s) })
        const a = k(PREVIEW_SCALE)
        const b = k(LIFT)
        m.animate({
          from: { ...a, scale: PREVIEW_SCALE },
          to: { ...b, scale: LIFT },
          duration: MOTION.enter,
          ease: EASE.out,
        })
        m.add_css_class("dw-proxy")
        gallery.dim(true)
      },
      move(x, y) {
        if (!proxy) return
        const { left, top } = proxyAt(x, y)
        fixed.move(proxy.m, left, top)
        const spot = overSheet(x, y) ? null : store.slotFor(null, proxy.size, pxToCell(store.getGrid(), left, top))
        if (spot) ghost.show(spot, proxy.size)
        else ghost.hide()
      },
      end(x, y) {
        if (!proxy) return
        const p = proxy
        proxy = null
        ghost.hide()
        gallery.dim(false)
        const { left, top } = { left: x - p.fx * p.w, top: y - p.fy * p.h }
        const id = overSheet(x, y) ? null : store.add(p.kind, p.size, pxToCell(store.getGrid(), left, top), p.config)
        const f = id ? frames.get(id) : null
        if (f) {
          // hand over to the real widget, which settles from right where the pointer let go
          const it = store.items.get().find((i) => i.id === id)!
          const slot = cellToPx(store.getGrid(), it.col, it.row)
          f.frame.settleFrom(left - slot.x, top - slot.y, LIFT)
          drop(p)
          return
        }
        // dropped back on the gallery (or nowhere to go): shrink away
        p.m.animate({ to: { scale: PREVIEW_SCALE, opacity: 0 }, duration: MOTION.exit, ease: EASE.in, done: () => drop(p) })
      },
    },
  })

  const overlay = new Gtk.Overlay({ child: fixed })
  overlay.add_overlay(gallery.widget)
  editing.subscribe(() => (editing.get() ? gallery.open() : gallery.close()))

  return (
    <window
      $={(self) => {
        const key = new Gtk.EventControllerKey()
        key.connect("key-pressed", (_c, keyval) => {
          if (keyval === Gdk.KEY_Escape && editing.get()) {
            setEditing(false)
            return true
          }
          return false
        })
        self.add_controller(key)
        const apply = () => {
          const on = editing.get()
          self.layer = on ? Astal.Layer.TOP : Astal.Layer.BOTTOM
          self.keymode = on ? Astal.Keymode.EXCLUSIVE : Astal.Keymode.ON_DEMAND
          if (on) self.add_css_class("editing")
          else {
            self.remove_css_class("editing")
            // hand the keyboard back: nothing on the desktop keeps focus after editing
            self.set_focus(null)
          }
        }
        editing.subscribe(apply)
        apply()
      }}
      name="desktop"
      namespace="desktop"
      class="Desktop"
      layer={Astal.Layer.BOTTOM}
      anchor={TOP | LEFT | RIGHT | BOTTOM}
      exclusivity={Astal.Exclusivity.NORMAL}
      keymode={Astal.Keymode.ON_DEMAND}
      application={app}
      // last: the surface maps with every layer-shell property already set
      visible
    >
      {overlay}
    </window>
  )
}


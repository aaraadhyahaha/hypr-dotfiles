import { Gdk, Gtk } from "ags/gtk4"
import { createRoot, createState } from "ags"
import { Motion, ENTER, LEAVE, LIFT, MOTION, EASE, onShow, settle } from "../common/motion"
import { cellToPx, nearestSize, pxToCell, sizePx, type Cell, type Item, type Size } from "./layout"
import { entry, SIZE_NAMES } from "./catalog"
import { editorFor, render } from "./registry"
import { editing, live, setEditing } from "./state"
import * as store from "./store"
import type { Config } from "./widgets/types"

// One desktop widget on the grid: the glass card, dragging (lift, follow, settle), the corner
// resize handle, the right-click menu and, in edit mode, the remove badge.
//
// Dragging never relayouts: the card follows the pointer as a paint-time offset on its <Motion>,
// and is moved in the Gtk.Fixed once, on drop, with the leftover offset animated back to zero.

export type Ghost = { show(cell: Cell, size: Size, blocked?: boolean): void; hide(): void }
export type Host = { fixed: Gtk.Fixed; ghost: Ghost; raise(w: Gtk.Widget): void }

export type Frame = { widget: Gtk.Widget; update(item: Item): void; destroy(): void }

// GTK's own drag threshold is 8px; a little less feels more direct on a touchpad
const THRESHOLD = 6
// transparent room around the card, so the remove badge can straddle its corner
export const BLEED = 10

// presses here belong to the widget's content, not to moving the card
function blocksDrag(w: Gtk.Widget | null, stop: Gtk.Widget) {
  for (let x = w; x && x !== stop; x = x.get_parent())
    if (
      x instanceof Gtk.Text ||
      x instanceof Gtk.TextView ||
      x instanceof Gtk.Calendar ||
      x instanceof Gtk.Scale ||
      x.has_css_class("dw-nodrag")
    )
      return true
  return false
}

const glyph = (g: string, cls = "glyph") => {
  const l = new Gtk.Label({ label: g })
  l.add_css_class(cls)
  return l
}

export function createFrame(host: Host, initial: Item, opts: { animateIn?: boolean }): Frame {
  let item = initial
  const e = entry(item.kind)
  const sizes = e?.sizes ?? [item.size]
  const [config, setConfig] = createState<Config>(item.config)

  const motion = new Motion()
  const overlay = new Gtk.Overlay()
  overlay.add_css_class("dw-frame")
  motion.append(overlay)

  const card = new Gtk.Box({
    hexpand: false,
    vexpand: false,
    marginTop: BLEED,
    marginBottom: BLEED,
    marginStart: BLEED,
    marginEnd: BLEED,
  })
  card.add_css_class("dw-card")
  card.overflow = Gtk.Overflow.HIDDEN
  overlay.set_child(card)

  // content, rebuilt (in its own scope) whenever the size changes
  let disposeContent = () => {}
  let activate: (() => void) | null = null
  const build = () => {
    disposeContent()
    let c: Gtk.Widget | null
    while ((c = card.get_first_child())) card.remove(c)
    activate = null
    for (const s of ["s", "m", "l", "xl"]) card.remove_css_class(`size-${s}`)
    card.add_css_class(`size-${item.size}`)
    card.add_css_class(`dw-${item.kind}`)
    const { w, h } = sizePx(item.size)
    card.set_size_request(w, h)
    createRoot((dispose) => {
      disposeContent = dispose
      card.append(
        render(item.kind, {
          size: item.size,
          config,
          setConfig: (change) => store.setConfig(item.id, change),
          live,
          preview: false,
          onActivate: (fn) => (activate = fn),
        }),
      )
    })
  }

  const place = () => {
    const { x, y } = cellToPx(item.col, item.row)
    host.fixed.move(motion, x - BLEED, y - BLEED)
  }

  // ── drag to move ──────────────────────────────────────────────────────────
  const drag = new Gtk.GestureDrag({ button: Gdk.BUTTON_PRIMARY })
  let dragging = false
  let denied = false
  const targetFor = (dx: number, dy: number) => {
    const p = cellToPx(item.col, item.row)
    return store.slotFor(item.id, item.size, pxToCell(p.x + dx, p.y + dy))
  }
  drag.connect("drag-begin", (g, x, y) => {
    dragging = false
    denied = blocksDrag(overlay.pick(x, y, Gtk.PickFlags.DEFAULT), overlay)
    if (denied) g.set_state(Gtk.EventSequenceState.DENIED)
  })
  drag.connect("drag-update", (g, dx, dy) => {
    if (denied) return
    if (!dragging) {
      if (Math.hypot(dx, dy) < THRESHOLD) return
      dragging = true
      g.set_state(Gtk.EventSequenceState.CLAIMED) // a button under the pointer won't click
      host.raise(motion)
      overlay.add_css_class("lifted")
      motion.stop()
    }
    motion.set({ x: dx, y: dy, scale: LIFT })
    host.ghost.show(targetFor(dx, dy) ?? item, item.size)
  })
  drag.connect("drag-end", (_g, dx, dy) => {
    if (denied) return
    if (!dragging) {
      // a click, not a drag
      if (Math.hypot(dx, dy) < THRESHOLD) activate?.()
      return
    }
    dragging = false
    host.ghost.hide()
    overlay.remove_css_class("lifted")
    const spot = targetFor(dx, dy) ?? item
    const from = cellToPx(item.col, item.row)
    const to = cellToPx(spot.col, spot.row)
    motion.origin = "center"
    item = { ...item, col: spot.col, row: spot.row }
    place()
    motion.animate(settle({ x: from.x + dx - to.x, y: from.y + dy - to.y, scale: LIFT }))
    store.move(item.id, spot)
  })
  overlay.add_controller(drag)

  // ── corner handle to resize ───────────────────────────────────────────────
  if (sizes.length > 1) {
    const handle = new Gtk.Box({ halign: Gtk.Align.END, valign: Gtk.Align.END })
    handle.add_css_class("dw-resize")
    handle.add_css_class("dw-nodrag")
    handle.set_cursor(Gdk.Cursor.new_from_name("se-resize", null))
    overlay.add_overlay(handle)
    const rs = new Gtk.GestureDrag({ button: Gdk.BUTTON_PRIMARY })
    let want: Size = item.size
    rs.connect("drag-begin", (g) => {
      g.set_state(Gtk.EventSequenceState.CLAIMED)
      want = item.size
      overlay.add_css_class("resizing")
    })
    rs.connect("drag-update", (_g, dx, dy) => {
      const base = sizePx(item.size)
      want = nearestSize(sizes, base.w + dx, base.h + dy)
      const spot = want === item.size ? item : store.slotFor(item.id, want, item)
      host.ghost.show(spot ?? item, want, !spot)
    })
    rs.connect("drag-end", () => {
      host.ghost.hide()
      overlay.remove_css_class("resizing")
      if (want !== item.size) store.resize(item.id, want) // update() plays the morph
    })
    handle.add_controller(rs)
  }

  // ── edit-mode remove badge ────────────────────────────────────────────────
  const badge = new Gtk.Button({ halign: Gtk.Align.START, valign: Gtk.Align.START, child: glyph("") })
  badge.add_css_class("dw-remove")
  badge.set_tooltip_text("Remove Widget")
  overlay.add_overlay(badge)
  // only reachable in edit mode: an invisible but focused badge would take a stray Space
  const syncBadge = () => {
    badge.set_can_target(editing.get())
    badge.set_can_focus(editing.get())
    if (editing.get()) overlay.add_css_class("editing")
    else overlay.remove_css_class("editing")
  }
  const unsubEditing = editing.subscribe(syncBadge)
  syncBadge()

  const removeAnimated = () => {
    motion.origin = "center"
    motion.animate({ ...LEAVE.remove, done: () => store.remove(item.id) })
  }
  badge.connect("clicked", removeAnimated)

  // ── right-click menu ──────────────────────────────────────────────────────
  let pop: Gtk.Popover | null = null
  const menu = () => {
    if (pop) return pop
    pop = new Gtk.Popover({ hasArrow: false })
    pop.add_css_class("dw-menu-pop")
    pop.set_parent(overlay)
    const m = new Motion({ origin: "top" })
    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
    box.add_css_class("menu")
    m.append(box)
    pop.set_child(m)
    onShow(pop, m, ENTER.popover)

    const row = (text: string, g: string, fn: () => void, danger = false) => {
      const b = new Gtk.Button()
      b.add_css_class("menu-item")
      if (danger) b.add_css_class("danger")
      const inner = new Gtk.Box()
      inner.append(glyph(g))
      inner.append(new Gtk.Label({ label: text, xalign: 0, hexpand: true }))
      b.set_child(inner)
      b.connect("clicked", () => {
        pop!.popdown()
        fn()
      })
      box.append(b)
    }

    if (sizes.length > 1) {
      const seg = new Gtk.Box({ homogeneous: true })
      seg.add_css_class("dw-sizes")
      for (const s of sizes) {
        const b = new Gtk.Button({ label: s.toUpperCase(), tooltipText: SIZE_NAMES[s] })
        b.add_css_class("dw-size")
        b.connect("clicked", () => {
          pop!.popdown()
          store.resize(item.id, s)
        })
        seg.append(b)
      }
      box.append(seg)
      pop.connect("notify::visible", () => {
        let i = 0
        for (let b = seg.get_first_child(); b; b = b.get_next_sibling(), i++)
          if (sizes[i] === item.size) b.add_css_class("on")
          else b.remove_css_class("on")
      })
    }
    const edit = editorFor(item.kind)
    if (e?.editable && edit)
      row("Edit Widget…", "", () => edit(overlay, config.get(), (change) => store.setConfig(item.id, change)))
    row("Edit Widgets", "", () => setEditing(true))
    row("Remove Widget", "", removeAnimated, true)
    return pop
  }
  const right = new Gtk.GestureClick({ button: Gdk.BUTTON_SECONDARY })
  right.connect("pressed", (g, _n, x, y) => {
    if (blocksDrag(overlay.pick(x, y, Gtk.PickFlags.DEFAULT), overlay)) return
    g.set_state(Gtk.EventSequenceState.CLAIMED)
    const p = menu()
    p.set_pointing_to(new Gdk.Rectangle({ x: Math.round(x), y: Math.round(y), width: 1, height: 1 }))
    p.popup()
  })
  overlay.add_controller(right)

  // ── lifecycle ─────────────────────────────────────────────────────────────
  build()
  const { x, y } = cellToPx(item.col, item.row)
  host.fixed.put(motion, x - BLEED, y - BLEED)
  if (opts.animateIn) motion.animate(ENTER.add)

  return {
    widget: motion,
    update(next: Item) {
      const prev = item
      item = next
      if (next.config !== prev.config) setConfig(next.config)
      if (next.size !== prev.size) {
        // morph from the old box: rebuild once at the new size, start stretched back to the
        // old one, and let it settle. Content fades up as it unstretches.
        const a = sizePx(prev.size)
        const b = sizePx(next.size)
        const pa = cellToPx(prev.col, prev.row)
        const pb = cellToPx(next.col, next.row)
        build()
        place()
        host.raise(motion) // travels over its neighbours, never under
        motion.origin = "top-left"
        // the pivot is the frame's corner, BLEED outside the card: correct for it
        const sx = a.w / b.w
        const sy = a.h / b.h
        motion.animate({
          from: { x: pa.x - pb.x + BLEED * (1 - sx), y: pa.y - pb.y + BLEED * (1 - sy), sx, sy, opacity: 0.55 },
          duration: MOTION.enter,
          ease: EASE.out,
          done: () => (motion.origin = "center"),
        })
      } else if (next.col !== prev.col || next.row !== prev.row) {
        // moved from elsewhere (reflow): glide there rather than jump
        const a = cellToPx(prev.col, prev.row)
        const b = cellToPx(next.col, next.row)
        place()
        host.raise(motion)
        motion.origin = "center"
        motion.animate(settle({ x: a.x - b.x, y: a.y - b.y }))
      }
    },
    destroy() {
      unsubEditing()
      disposeContent()
      if (pop) {
        pop.unparent()
        pop = null
      }
      host.fixed.remove(motion)
    },
  }
}

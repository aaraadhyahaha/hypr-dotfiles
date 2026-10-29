import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { createRoot } from "ags"
import GObject from "gi://GObject"
import GLib from "gi://GLib"
import Graphene from "gi://Graphene"
import Gsk from "gi://Gsk"
import Pango from "gi://Pango"
import cairo from "cairo"
import { Motion, ENTER, LEAVE, LAYER_GONE } from "../common/motion"
import { bridges, markSeen, prompt } from "../../service/bridge"
import { fxRun, fxStatus, openFx } from "../../service/fx"
import { type Bridge, dayOf, shown } from "../../service/bridgeModel"
import { sheetMonitor } from "./BridgeSheet"

// The corner note (bridge.note): a yellow sticky note tilted -4°, overhanging the bottom-right
// corner, under app windows. Shows the newest task note or last night's question (bridgeModel's
// `shown`). It slaps in once the pause sheet has faded, on the sheet's monitor; resuming its task
// by any route (a click on it, fx focus, fx done) lifts it and swoops it off past the corner.
// Only the yellow takes clicks: the window's input region is the rotated note.

const DEG = -4
const OVER = 72 // past the right and bottom edges, so no desktop shows along either at this tilt
// room above and left of the note at rest for the slap's overshoot and the lift, which the surface would clip
const SLACK = 16
const STRIP = 2 // the input region is the rotated note in strips this tall

const rad = (DEG * Math.PI) / 180
const pt = (x: number, y: number) => new Graphene.Point({ x, y })

// the note's corners at rest, relative to the screen's bottom-right corner
function quad(w: number, h: number): [number, number][] {
  const cx = -(w / 2 - OVER)
  const cy = -(h / 2 - OVER)
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c])
}

// the rotated quad as horizontal strips, in a W×H surface anchored bottom-right
function region(corner: [number, number][], W: number, H: number) {
  const poly = corner.map(([x, y]) => [W + x, H + y])
  const r = new cairo.Region()
  for (let y = 0; y < H; y += STRIP) {
    const ym = y + STRIP / 2
    const xs: number[] = []
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]
      const [xj, yj] = poly[j]
      if (yi > ym !== yj > ym) xs.push(xi + ((ym - yi) * (xj - xi)) / (yj - yi))
    }
    if (xs.length < 2) continue
    const x0 = Math.max(0, Math.floor(Math.min(...xs)))
    const x1 = Math.min(W, Math.ceil(Math.max(...xs)))
    if (x1 > x0)
      r.unionRectangle({
        x: x0,
        y,
        width: x1 - x0,
        height: Math.min(STRIP, H - y),
      })
  }
  return r
}

// sizes itself to the on-screen part of its rotated child and places it there; picking follows the
// transform, and the surface's input region is re-set on every allocate (GDK skips an unchanged one)
const NoteCorner = GObject.registerClass(
  { GTypeName: "AgsNoteCorner" },
  class NoteCorner extends Gtk.Widget {
    declare _child: Gtk.Widget

    constructor(child: Gtk.Widget) {
      super()
      this._child = child
      child.set_parent(this)
    }

    size(): [number, number] {
      const w = this._child.measure(Gtk.Orientation.HORIZONTAL, -1)[1]
      return [w, this._child.measure(Gtk.Orientation.VERTICAL, w)[1]]
    }

    vfunc_measure(
      o: Gtk.Orientation,
      _for: number,
    ): [number, number, number, number] {
      const poly = quad(...this.size())
      const v =
        Math.ceil(
          -Math.min(
            ...poly.map((p) =>
              o === Gtk.Orientation.HORIZONTAL ? p[0] : p[1],
            ),
          ),
        ) + SLACK
      return [v, v, -1, -1]
    }

    // the window may be larger than asked (it never shrinks on its own): place from its bottom-right
    vfunc_size_allocate(W: number, H: number, _b: number) {
      const [w, h] = this.size()
      const t = new Gsk.Transform()
        .translate(pt(W - (w / 2 - OVER), H - (h / 2 - OVER)))!
        .rotate(DEG)!
        .translate(pt(-w / 2, -h / 2))
      this._child.allocate(w, h, -1, t)
      this.applyRegion()
    }

    applyRegion() {
      const surface = this.get_native()?.get_surface()
      if (!surface) return
      surface.set_input_region(
        region(quad(...this.size()), this.get_width(), this.get_height()),
      )
      // GDK sends the region on the next commit; a still note never commits on its own
      this.queue_draw()
    }

    vfunc_dispose() {
      this._child?.unparent()
      super.vfunc_dispose()
    }
  },
)

const pad = (n: number) => String(n).padStart(2, "0")
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const dayLabel = (d: Date) =>
  GLib.DateTime.new_from_unix_local(Math.floor(d.getTime() / 1000)).format(
    "%a %-d %b",
  ) ?? ""

function eyebrowFor(b: Bridge) {
  const at = new Date(b.at)
  return b.kind === "day"
    ? `Tomorrow's first question · ${dayLabel(at)}`
    : `${b.title || "This task"} · paused ${hhmm(at)}`
}

let started = false

// called once from app.ts, after Desktop() so it stacks above the desktop layer
export default function BridgeNote() {
  if (started) return
  started = true
  let win!: Astal.Window
  let corner!: InstanceType<typeof NoteCorner>
  let motion!: Motion
  let eyebrow!: Gtk.Label
  let text!: Gtk.Label
  let pickup!: Gtk.Label
  let current: Bridge | null = null // the note on screen, leaving included
  let leaving = false
  let wait = 0 // the sheet's fade, before the note may change

  const hide = () => {
    leaving = false
    current = null
    win.visible = false
  }

  // lift, swoop off past the corner, then go
  const leave = (then?: () => void) => {
    if (leaving) return
    leaving = true
    motion.animate({
      ...LEAVE.lift,
      done: () =>
        motion.animate({
          ...LEAVE.swoop,
          done: () => {
            if (!leaving) return // a new note slapped in meanwhile
            hide()
            then?.()
          },
        }),
    })
  }

  const click = () => {
    const b = current
    if (!b || leaving) return
    if (b.taskId !== null) fxRun("focus", String(b.taskId))
    leave(() => {
      markSeen(b)
      openFx()
    })
  }

  const { BOTTOM, RIGHT } = Astal.WindowAnchor
  createRoot(() => {
    const note = (
      <box
        class="note"
        orientation={Gtk.Orientation.VERTICAL}
        valign={Gtk.Align.START}
      >
        <label
          $={(self) => (eyebrow = self as Gtk.Label)}
          class="note-eyebrow"
          xalign={0}
          ellipsize={Pango.EllipsizeMode.END}
          maxWidthChars={1}
        />
        <label
          $={(self) => (text = self as Gtk.Label)}
          class="note-line"
          xalign={0}
          wrap
          wrapMode={Pango.WrapMode.WORD_CHAR}
          maxWidthChars={1}
        />
        <label
          $={(self) => (pickup = self as Gtk.Label)}
          class="note-line note-pickup"
          xalign={0}
          wrap
          wrapMode={Pango.WrapMode.WORD_CHAR}
          maxWidthChars={1}
        />
      </box>
    ) as Gtk.Widget
    const gesture = new Gtk.GestureClick()
    gesture.connect("released", click)
    note.add_controller(gesture)

    return (
      <window
        $={(self) => {
          win = self as Astal.Window
          win.connect("map", () => corner.applyRegion())
        }}
        name="bridgenote"
        namespace="bridgenote"
        class="BridgeNote"
        layer={Astal.Layer.BOTTOM}
        keymode={Astal.Keymode.NONE}
        exclusivity={Astal.Exclusivity.IGNORE}
        anchor={BOTTOM | RIGHT}
        application={app}
        visible={false}
      >
        {
          (corner = new NoteCorner(
            (
              <Motion $={(self) => (motion = self)} origin="center">
                {note}
              </Motion>
            ) as Gtk.Widget,
          ))
        }
      </window>
    )
  })

  const show = (b: Bridge) => {
    leaving = false
    current = b
    eyebrow.label = eyebrowFor(b)
    text.label = b.text
    text.visible = b.text !== ""
    pickup.label = b.pickup
    pickup.visible = b.pickup !== ""
    if (!win.visible) {
      const mon = sheetMonitor()
      if (mon) win.gdkmonitor = mon
    }
    // a surface keeps its largest size: re-measure so a shorter note doesn't sit in a taller window
    win.set_default_size(-1, -1)
    win.queue_resize()
    motion.animate(ENTER.slap)
    win.visible = true
  }

  const render = () => {
    // the sheet is up, or still fading: the note waits for it
    if (prompt.get() || wait) return
    const b = shown(bridges.get(), fxStatus.get(), dayOf(new Date()))
    if (b === current) return
    if (b) show(b)
    else if (current) leave()
  }

  prompt.subscribe(() => {
    if (prompt.get()) return
    if (wait) GLib.source_remove(wait)
    wait = GLib.timeout_add(GLib.PRIORITY_DEFAULT, LAYER_GONE, () => {
      wait = 0
      render()
      return GLib.SOURCE_REMOVE
    })
  })
  bridges.subscribe(render)
  fxStatus.subscribe(render)
  render()
}

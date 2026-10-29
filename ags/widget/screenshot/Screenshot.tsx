import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { timeout } from "ags/time"
import { Motion, ENTER, LEAVE } from "../common/motion"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import GdkPixbuf from "gi://GdkPixbuf"
import GObject from "gi://GObject"
import Graphene from "gi://Graphene"
import Pango from "gi://Pango"

const HOME = GLib.get_home_dir()
const DIR = `${HOME}/Pictures/Screenshots`
const stamp = () => GLib.DateTime.new_now_local().format("%Y%m%d_%H%M%S")!
// an annotation tool for the toast's Edit, if one is installed; else it offers Open
const EDITOR = GLib.find_program_in_path("satty")
    ? ["satty", "--filename"]
    : GLib.find_program_in_path("swappy")
        ? ["swappy", "-f"]
        : null

let previewFn: (file: string) => void = () => { }
let regionFn = () => { }
let shootFn: (geometry?: string) => void = () => { }
let pickFn: () => Promise<string | null | undefined> = async () => null
export const screenshotRegion = () => regionFn()
export const screenshotFull = () => shootFn()
// grim's "x,y wxh" in global coordinates; none = every output
export const screenshotGeometry = (geometry?: string) => shootFn(geometry)
// the region picker on its own: a geometry, undefined for Enter (full screen), null for Esc
export const pickRegion = () => pickFn()

const rgba = (red: number, green: number, blue: number, alpha: number) =>
    new Gdk.RGBA({ red, green, blue, alpha })
const DIM = rgba(0, 0, 0, 0.4)
const EDGE = rgba(0.663, 0.722, 1, 1)
const HINT = rgba(1, 1, 1, 0.9)
const HINT_TEXT = "Drag to select  ·  Enter: full screen  ·  Esc: cancel"

// The region picker's dim + selection, painted as GPU render nodes. A cairo DrawingArea
// rasterised a monitor-sized surface on the CPU every drag frame (and GJS held each one
// until GC), which stuttered under memory pressure.
const Selection = GObject.registerClass(
    { GTypeName: "AgsShotSelection" },
    class Selection extends Gtk.Widget {
        declare _sel: [number, number, number, number] | null
        declare _hint: Pango.Layout
        declare _size: Pango.Layout

        constructor() {
            super({ hexpand: true, vexpand: true })
            this._sel = null
            this._hint = this.create_pango_layout(HINT_TEXT)
            this._hint.set_font_description(Pango.FontDescription.from_string("SF Pro Text 14px"))
            this._size = this.create_pango_layout("")
            this._size.set_font_description(Pango.FontDescription.from_string("SF Pro Text Bold 13px"))
        }

        // null: no selection yet (full dim + hint)
        select(sel: [number, number, number, number] | null) {
            this._sel = sel
            this.queue_draw()
        }

        vfunc_snapshot(s: Gtk.Snapshot) {
            const w = this.get_width()
            const h = this.get_height()
            const fill = (c: Gdk.RGBA, x: number, y: number, rw: number, rh: number) => {
                if (rw > 0 && rh > 0) s.append_color(c, new Graphene.Rect().init(x, y, rw, rh))
            }
            const text = (layout: Pango.Layout, c: Gdk.RGBA, x: number, y: number) => {
                s.save()
                s.translate(new Graphene.Point({ x, y }))
                s.append_layout(layout, c)
                s.restore()
            }

            const sel = this._sel
            if (!sel) {
                fill(DIM, 0, 0, w, h)
                const [tw] = this._hint.get_pixel_size()
                text(this._hint, HINT, (w - tw) / 2, 34)
                return
            }

            const [x, y, rw, rh] = sel
            fill(DIM, 0, 0, w, y)
            fill(DIM, 0, y + rh, w, h - y - rh)
            fill(DIM, 0, y, x, rh)
            fill(DIM, x + rw, y, w - x - rw, rh)

            // a 2px outline just inside the selection
            const b = Math.min(2, rw / 2, rh / 2)
            fill(EDGE, x, y, rw, b)
            fill(EDGE, x, y + rh - b, rw, b)
            fill(EDGE, x, y + b, b, rh - 2 * b)
            fill(EDGE, x + rw - b, y + b, b, rh - 2 * b)

            this._size.set_text(`${Math.round(rw)} × ${Math.round(rh)}`, -1)
            const [, th] = this._size.get_pixel_size()
            text(this._size, EDGE, x, y > 22 ? y - 6 - th : y + rh + 6)
        }
    },
)
type Selection = InstanceType<typeof Selection>

export function ShotPreview() {
    let win: Astal.Window
    let box: Gtk.Box
    let timer: { cancel: () => void } | null = null

    // slide back out past the screen edge, then hide
    const dismiss = (m: Motion) => {
        m.animate({
            ...LEAVE.edge,
            done: () => {
                if (m.get_parent() !== box) return
                box.remove(m)
                win.visible = false
            },
        })
    }

    previewFn = (file) => {
        timer?.cancel()
        let c
        while ((c = box.get_first_child())) box.remove(c)

        // laid out like a toast's NotifRow: 48px thumbnail · app / now · summary · actions
        const card = new Gtk.Box({ spacing: 12 })
        card.add_css_class("toast")
        card.add_css_class("shot-toast")
        const motion = new Motion()
        motion.append(card)

        try {
            // a centred square crop, drawn at 48px (an image sizes to pixelSize, a picture to its texture)
            const full = GdkPixbuf.Pixbuf.new_from_file(file)
            const side = Math.min(full.width, full.height)
            const square = full
                .new_subpixbuf((full.width - side) >> 1, (full.height - side) >> 1, side, side)
                .scale_simple(120, 120, GdkPixbuf.InterpType.BILINEAR)!
            const pic = Gtk.Image.new_from_paintable(Gdk.Texture.new_for_pixbuf(square))
            pic.pixelSize = 48
            pic.valign = Gtk.Align.START
            pic.overflow = Gtk.Overflow.HIDDEN
            pic.add_css_class("shot-thumb")
            card.append(pic)
        } catch (e) {
            console.error(e)
        }

        const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 3, hexpand: true })
        const head = new Gtk.Box()
        const app = new Gtk.Label({ label: "Screenshot", xalign: 0, hexpand: true })
        app.add_css_class("app")
        const time = new Gtk.Label({ label: "now" })
        time.add_css_class("notif-time")
        head.append(app)
        head.append(time)
        const title = new Gtk.Label({ label: `Saved to ${DIR.replace(HOME, "~")}`, xalign: 0, wrap: true })
        title.add_css_class("summary")
        text.append(head)
        text.append(title)

        const actions = new Gtk.Box({ spacing: 6, halign: Gtk.Align.START })
        actions.add_css_class("actions")
        const action = (label: string, cmd: string[]) => {
            const b = new Gtk.Button({ label })
            b.connect("clicked", () => {
                execAsync(cmd).catch(console.error)
                dismiss(motion)
            })
            actions.append(b)
        }
        action(EDITOR ? "Edit" : "Open", EDITOR ? [...EDITOR, file] : ["xdg-open", file])
        action("Copy", ["sh", "-c", 'wl-copy --type image/png < "$1"', "sh", file])
        text.append(actions)
        card.append(text)

        const click = new Gtk.GestureClick()
        click.connect("pressed", (_, _n, x, y) => {
            // the buttons handle their own click
            const hit = card.pick(x, y, Gtk.PickFlags.DEFAULT)
            if (hit && (hit instanceof Gtk.Button || hit.get_ancestor(Gtk.Button.$gtype))) return
            execAsync(["xdg-open", file]).catch(console.error)
            dismiss(motion)
        })
        card.add_controller(click)

        motion.animate(ENTER.edge)
        box.append(motion)
        win.visible = true
        timer = timeout(4500, () => dismiss(motion))
    }

    return (
        <window
            $={(self) => (win = self)}
            visible={false}
            name="shotpreview"
            namespace="shotpreview"
            class="Toasts"
            layer={Astal.Layer.OVERLAY}
            exclusivity={Astal.Exclusivity.IGNORE}
            anchor={Astal.WindowAnchor.BOTTOM | Astal.WindowAnchor.RIGHT}
            application={app}
        >
            <box $={(self) => (box = self)} orientation={Gtk.Orientation.VERTICAL} />
        </window>
    )
}

export default function Screenshot() {
    const mon = app.get_monitors()[0]
    const geo = mon.get_geometry()
    let win: Astal.Window
    let area: Selection
    let busy = false
    let sx = 0, sy = 0, ex = 0, ey = 0
    // set while pickRegion() waits: the picker hands its result back instead of capturing
    let picked: ((g: string | null | undefined) => void) | null = null

    const rect = (): [number, number, number, number] => [
        Math.min(sx, ex), Math.min(sy, ey), Math.abs(ex - sx), Math.abs(ey - sy),
    ]

    const global = ([x, y, w, h]: [number, number, number, number]) =>
        `${Math.round(x + geo.x)},${Math.round(y + geo.y)} ${Math.round(w)}x${Math.round(h)}`

    // hand a pick back to pickRegion(), or capture it
    const done = (g: string | null | undefined) => {
        win.visible = false
        const resolve = picked
        picked = null
        if (resolve) resolve(g)
        else if (g !== null) capture(g)
    }

    const capture = async (geometry?: string) => {
        if (busy) return
        busy = true
        try {
            win.visible = false
            await new Promise<void>((r) => timeout(180, () => r()))
            await execAsync(["mkdir", "-p", DIR])
            const file = `${DIR}/shot_${stamp()}.png`
            const args = ["grim"]
            if (geometry) args.push("-g", geometry)
            args.push(file)
            await execAsync(args)
            previewFn(file)
            execAsync([
                "sh", "-c",
                'wl-copy --type image/png < "$1" >/dev/null 2>&1 &',
                "sh", file,
            ]).catch(console.error)
        } catch (e) {
            console.error("screenshot error:", e)
        } finally {
            busy = false
        }
    }

    regionFn = () => {
        if (busy) return
        if (win.visible) { done(null); return }
        area.select(null)
        win.visible = true
    }
    shootFn = (geometry) => { capture(geometry) }
    pickFn = () => new Promise((resolve) => {
        picked?.(null)
        picked = resolve
        area.select(null)
        win.visible = true
    })

    return (
        <window
            $={(self) => {
                win = self
                const key = new Gtk.EventControllerKey()
                key.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
                key.connect("key-pressed", (_, keyval) => {
                    if (keyval === Gdk.KEY_Escape) { done(null); return true }
                    if (keyval === Gdk.KEY_Return) { done(undefined); return true }
                    return false
                })
                self.add_controller(key)
            }}
            visible={false}
            name="shot"
            namespace="shot"
            class="Shot"
            gdkmonitor={mon}
            layer={Astal.Layer.OVERLAY}
            keymode={Astal.Keymode.EXCLUSIVE}
            exclusivity={Astal.Exclusivity.IGNORE}
            anchor={
                Astal.WindowAnchor.TOP | Astal.WindowAnchor.BOTTOM |
                Astal.WindowAnchor.LEFT | Astal.WindowAnchor.RIGHT
            }
            application={app}
        >
            <Selection
                $={(self: Selection) => {
                    area = self
                    self.set_cursor_from_name("crosshair")
                    const drag = new Gtk.GestureDrag()
                    drag.connect("drag-begin", (_, x, y) => {
                        sx = ex = x
                        sy = ey = y
                        area.select(rect())
                    })
                    drag.connect("drag-update", (_, dx, dy) => {
                        ex = sx + dx
                        ey = sy + dy
                        area.select(rect())
                    })
                    drag.connect("drag-end", (_, dx, dy) => {
                        ex = sx + dx
                        ey = sy + dy
                        const r = rect()
                        if (r[2] < 6 || r[3] < 6) {
                            area.select(null)
                            return
                        }
                        done(global(r))
                    })
                    self.add_controller(drag)
                }}
            />
        </window>
    )
}
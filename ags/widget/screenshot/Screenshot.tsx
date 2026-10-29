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
import { recording, stopRecording } from "../../service/recorder"
import { capture as captureShot, mode, setMode } from "./Toolbar"
import {
    type Client, type Hit, type Mode, type Rect,
    CURSOR, defaultRect, dragRect, geometry, hitTest, windowAt,
} from "./model"

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
let shootFn: (geometry?: string) => void = () => { }
let openFn = () => { }
let closeFn = () => { }
let targetFn: () => string | null | undefined = () => null
export const screenshotFull = () => shootFn()
// grim's "x,y wxh" in global coordinates; none = every output
export const screenshotGeometry = (geometry?: string) => shootFn(geometry)
// the screenshot session: the dimmed overlay (`shot`) with the toolbar (`shotmenu`) on top.
// While a recording runs, opening stops it instead, so the overlay never ends up in the video.
export const openShot = () => openFn()
// hides both windows at once, so grim / wf-recorder never see them
export const closeShot = () => closeFn()
// what the session would capture: a geometry, undefined for every output, null for nothing
export const shotTarget = () => targetFn()
export const screenshotRegion = () => {
    if (app.get_window("shot")?.visible) return closeShot()
    setMode("region")
    openShot()
}

const rgba = (red: number, green: number, blue: number, alpha: number) =>
    new Gdk.RGBA({ red, green, blue, alpha })
const DIM = rgba(0, 0, 0, 0.4)
const EDGE = rgba(0.663, 0.722, 1, 1)
const HANDLE = 10

// The session's dim + selection, painted as GPU render nodes. A cairo DrawingArea
// rasterised a monitor-sized surface on the CPU every drag frame (and GJS held each one
// until GC), which stuttered under memory pressure.
const Selection = GObject.registerClass(
    { GTypeName: "AgsShotSelection" },
    class Selection extends Gtk.Widget {
        declare _mode: Mode
        declare _rect: Rect | null
        declare _handles: boolean
        declare _size: Pango.Layout

        constructor() {
            super({ hexpand: true, vexpand: true })
            this._mode = "region"
            this._rect = null
            this._handles = false
            this._size = this.create_pango_layout("")
            this._size.set_font_description(Pango.FontDescription.from_string("SF Pro Text Bold 13px"))
        }

        // region: the rect with its size (and handles); window: the hovered window, null = none;
        // screen: just an outline
        paint(mode: Mode, rect: Rect | null, handles = false) {
            this._mode = mode
            this._rect = rect
            this._handles = handles
            this.queue_draw()
        }

        vfunc_snapshot(s: Gtk.Snapshot) {
            const w = this.get_width()
            const h = this.get_height()
            const fill = (c: Gdk.RGBA, x: number, y: number, rw: number, rh: number) => {
                if (rw > 0 && rh > 0) s.append_color(c, new Graphene.Rect().init(x, y, rw, rh))
            }
            // a 2px outline just inside the rect
            const outline = ({ x, y, w: rw, h: rh }: Rect) => {
                const b = Math.min(2, rw / 2, rh / 2)
                fill(EDGE, x, y, rw, b)
                fill(EDGE, x, y + rh - b, rw, b)
                fill(EDGE, x, y + b, b, rh - 2 * b)
                fill(EDGE, x + rw - b, y + b, b, rh - 2 * b)
            }

            if (this._mode === "screen") return outline({ x: 0, y: 0, w, h })
            const r = this._rect
            if (!r) return fill(DIM, 0, 0, w, h)

            const { x, y, w: rw, h: rh } = r
            fill(DIM, 0, 0, w, y)
            fill(DIM, 0, y + rh, w, h - y - rh)
            fill(DIM, 0, y, x, rh)
            fill(DIM, x + rw, y, w - x - rw, rh)
            outline(r)
            if (this._mode !== "region") return

            if (this._handles) {
                for (const hx of [x, x + rw / 2, x + rw])
                    for (const hy of [y, y + rh / 2, y + rh])
                        if (hx !== x + rw / 2 || hy !== y + rh / 2)
                            fill(EDGE, hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE)
            }

            this._size.set_text(`${Math.round(rw)} × ${Math.round(rh)}`, -1)
            const [, th] = this._size.get_pixel_size()
            s.save()
            s.translate(new Graphene.Point({ x, y: y > 22 + HANDLE ? y - 6 - HANDLE / 2 - th : y + rh + 6 + HANDLE / 2 }))
            s.append_layout(this._size, EDGE)
            s.restore()
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
    const bounds: Rect = { x: 0, y: 0, w: geo.width, h: geo.height }
    let win: Astal.Window
    let area: Selection
    let busy = false
    // the region outlives a session (not an ags restart)
    let region: Rect | null = null
    // window mode: hyprctl's clients and shown workspaces, fetched once per session
    let clients: Client[] = []
    let shown: number[] = []
    let loaded = false
    let hover: Client | null = null
    let locked = false
    // the drag in progress
    let dragging = false
    let hit: Hit = "new"
    let start: Rect = bounds
    let from: [number, number] = [0, 0]

    const local = (c: Client | null): Rect | null =>
        c && { x: c.at[0] - geo.x, y: c.at[1] - geo.y, w: c.size[0], h: c.size[1] }
    const under = (x: number, y: number) => windowAt(clients, shown, x + geo.x, y + geo.y)

    const draw = () => {
        const m = mode.get()
        if (m === "region") area.paint(m, region, !(dragging && hit === "new"))
        else area.paint(m, m === "window" ? local(hover) : null)
    }

    const loadWindows = async () => {
        try {
            const [c, m] = await Promise.all([
                execAsync(["hyprctl", "clients", "-j"]),
                execAsync(["hyprctl", "monitors", "-j"]),
            ])
            clients = JSON.parse(c)
            shown = JSON.parse(m)
                .flatMap((o: any) => [o.activeWorkspace?.id, o.specialWorkspace?.id])
                .filter(Boolean)
            // start on the focused window until the pointer moves
            if (!hover) hover = clients.find((c) => c.focusHistoryID === 0) ?? null
            draw()
        } catch (e) {
            console.error("screenshot windows:", e)
        }
    }

    // redraw for the toolbar's current mode
    const refresh = () => {
        const m = mode.get()
        if (m === "window" && !loaded) {
            loaded = true
            loadWindows()
        }
        area.set_cursor_from_name(m === "region" ? "crosshair" : "default")
        draw()
    }

    const capture = async (geometry?: string) => {
        if (busy) return
        busy = true
        try {
            closeFn()
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

    shootFn = (geometry) => { capture(geometry) }
    openFn = () => {
        if (busy) return
        if (recording.get()) { stopRecording(); return }
        region ??= defaultRect(bounds)
        hover = null
        locked = false
        loaded = false
        win.visible = true
        app.get_window("shotmenu")?.set_visible(true)
        refresh()
    }
    closeFn = () => {
        win.visible = false
        app.get_window("shotmenu")?.set_visible(false)
    }
    targetFn = () => {
        const m = mode.get()
        if (m === "screen") return undefined
        const r = m === "region" ? region : local(hover)
        return r && r.w >= 1 && r.h >= 1 ? geometry(r, geo) : null
    }
    mode.subscribe(() => win.visible && refresh())

    return (
        <window
            $={(self) => {
                win = self
                const key = new Gtk.EventControllerKey()
                key.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
                key.connect("key-pressed", (_, keyval) => {
                    switch (keyval) {
                        case Gdk.KEY_Escape:
                            closeFn()
                            return true
                        case Gdk.KEY_Return:
                        case Gdk.KEY_KP_Enter:
                        case Gdk.KEY_space:
                            captureShot()
                            return true
                    }
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
            // ON_DEMAND, not EXCLUSIVE: Hyprland forces the pointer onto an exclusive layer, so the
            // toolbar (`shotmenu`) could never be clicked. ON_DEMAND still takes focus when mapped.
            keymode={Astal.Keymode.ON_DEMAND}
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

                    // the cursor previews what a drag would do; in window mode, the pointer picks
                    const motion = new Gtk.EventControllerMotion()
                    motion.connect("motion", (_, x, y) => {
                        if (dragging) return
                        const m = mode.get()
                        if (m === "region" && region) {
                            self.set_cursor_from_name(CURSOR[hitTest(region, x, y)])
                        } else if (m === "window" && !locked) {
                            const c = under(x, y)
                            if (c !== hover) {
                                hover = c
                                draw()
                            }
                        }
                    })
                    self.add_controller(motion)

                    const drag = new Gtk.GestureDrag()
                    drag.connect("drag-begin", (_, x, y) => {
                        if (mode.get() !== "region" || !region) return
                        dragging = true
                        start = region
                        hit = hitTest(region, x, y)
                        from = [x, y]
                        self.set_cursor_from_name(CURSOR[hit])
                        draw()
                    })
                    drag.connect("drag-update", (_, dx, dy) => {
                        if (!dragging) return
                        region = dragRect(start, hit, from, dx, dy, bounds)
                        draw()
                    })
                    drag.connect("drag-end", (g, dx, dy) => {
                        if (mode.get() === "window") {
                            // a click (not a drag) locks the window under it
                            const [, x, y] = g.get_start_point()
                            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
                                hover = under(x, y)
                                locked = !!hover
                                draw()
                            }
                            return
                        }
                        if (!dragging) return
                        dragging = false
                        region = dragRect(start, hit, from, dx, dy, bounds)
                        // a slip (or a collapse to nothing) puts the previous rect back
                        if (region.w < 6 || region.h < 6) region = start
                        self.set_cursor_from_name(CURSOR[hit])
                        draw()
                    })
                    self.add_controller(drag)
                }}
            />
        </window>
    )
}

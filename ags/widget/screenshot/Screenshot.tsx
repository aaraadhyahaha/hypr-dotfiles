import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { timeout } from "ags/time"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import GdkPixbuf from "gi://GdkPixbuf"

const HOME = GLib.get_home_dir()
const DIR = `${HOME}/Pictures/Screenshots`
const stamp = () => GLib.DateTime.new_now_local().format("%Y%m%d_%H%M%S")!

let previewFn: (file: string) => void = () => { }
let regionFn = () => { }
let fullFn = () => { }
export const screenshotRegion = () => regionFn()
export const screenshotFull = () => fullFn()

export function ShotPreview() {
    let win: Astal.Window
    let box: Gtk.Box
    let timer: { cancel: () => void } | null = null

    const dismiss = (card: Gtk.Box) => {
        card.remove_css_class("in")
        card.add_css_class("out")
        timeout(260, () => {
            if (card.get_parent() === box) {
                box.remove(card)
                win.visible = false
            }
        })
    }

    previewFn = (file) => {
        timer?.cancel()
        let c
        while ((c = box.get_first_child())) box.remove(c)

        const card = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
        card.add_css_class("toast")
        card.add_css_class("shot-toast")
        card.add_css_class("in")

        try {
            const pb = GdkPixbuf.Pixbuf.new_from_file_at_scale(file, 240, 135, true)
            const pic = new Gtk.Picture({ halign: Gtk.Align.START })
            pic.set_paintable(Gdk.Texture.new_for_pixbuf(pb))
            pic.overflow = Gtk.Overflow.HIDDEN
            pic.add_css_class("shot-thumb")
            card.append(pic)
        } catch (e) {
            console.error(e)
        }

        const title = new Gtk.Label({ label: "Screenshot copied", xalign: 0 })
        title.add_css_class("summary")
        const sub = new Gtk.Label({ label: "Click to open", xalign: 0 })
        sub.add_css_class("app")
        card.append(title)
        card.append(sub)

        const click = new Gtk.GestureClick()
        click.connect("pressed", () => {
            execAsync(["xdg-open", file]).catch(console.error)
            dismiss(card)
        })
        card.add_controller(click)

        box.append(card)
        win.visible = true
        timeout(520, () => card.remove_css_class("in"))
        timer = timeout(4500, () => dismiss(card))
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
    let area: Gtk.DrawingArea
    let active = false
    let busy = false
    let sx = 0, sy = 0, ex = 0, ey = 0

    const rect = (): [number, number, number, number] => [
        Math.min(sx, ex), Math.min(sy, ey), Math.abs(ex - sx), Math.abs(ey - sy),
    ]

    const capture = async (region?: [number, number, number, number]) => {
        if (busy) return
        busy = true
        try {
            win.visible = false
            await new Promise<void>((r) => timeout(180, () => r()))
            await execAsync(["mkdir", "-p", DIR])
            const file = `${DIR}/shot_${stamp()}.png`
            const args = ["grim"]
            if (region) {
                const [x, y, w, h] = region
                args.push(
                    "-g",
                    `${Math.round(x + geo.x)},${Math.round(y + geo.y)} ${Math.round(w)}x${Math.round(h)}`,
                )
            }
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

    const draw = (_a: Gtk.DrawingArea, cr: any, w: number, h: number) => {
        cr.setSourceRGBA(0, 0, 0, 0.4)
        if (!active) {
            cr.rectangle(0, 0, w, h)
            cr.fill()
        } else {
            const [x, y, rw, rh] = rect()
            cr.rectangle(0, 0, w, y); cr.fill()
            cr.rectangle(0, y + rh, w, h - y - rh); cr.fill()
            cr.rectangle(0, y, x, rh); cr.fill()
            cr.rectangle(x + rw, y, w - x - rw, rh); cr.fill()

            cr.setSourceRGBA(0.663, 0.722, 1, 1)
            cr.setLineWidth(2)
            cr.rectangle(x + 1, y + 1, Math.max(0, rw - 2), Math.max(0, rh - 2))
            cr.stroke()

            cr.selectFontFace("SF Pro Text", 0, 1)
            cr.setFontSize(13)
            cr.moveTo(x, y > 22 ? y - 8 : y + rh + 18)
            cr.showText(`${Math.round(rw)} × ${Math.round(rh)}`)
        }
        if (!active) {
            const text = "Drag to select  ·  Enter: full screen  ·  Esc: cancel"
            cr.setSourceRGBA(1, 1, 1, 0.9)
            cr.selectFontFace("SF Pro Text", 0, 0)
            cr.setFontSize(14)
            const ext = cr.textExtents(text)
            cr.moveTo((w - ext.width) / 2, 48)
            cr.showText(text)
        }
    }

    regionFn = () => {
        if (busy) return
        if (win.visible) { win.visible = false; return }
        active = false
        area.queue_draw()
        win.visible = true
    }
    fullFn = () => { capture() }

    return (
        <window
            $={(self) => {
                win = self
                const key = new Gtk.EventControllerKey()
                key.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
                key.connect("key-pressed", (_, keyval) => {
                    if (keyval === Gdk.KEY_Escape) { win.visible = false; return true }
                    if (keyval === Gdk.KEY_Return) { capture(); return true }
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
            <Gtk.DrawingArea
                $={(self) => {
                    area = self
                    self.set_draw_func(draw)
                    self.set_cursor_from_name("crosshair")
                    const drag = new Gtk.GestureDrag()
                    drag.connect("drag-begin", (_, x, y) => {
                        active = true
                        sx = ex = x
                        sy = ey = y
                        area.queue_draw()
                    })
                    drag.connect("drag-update", (_, dx, dy) => {
                        ex = sx + dx
                        ey = sy + dy
                        area.queue_draw()
                    })
                    drag.connect("drag-end", (_, dx, dy) => {
                        ex = sx + dx
                        ey = sy + dy
                        const r = rect()
                        if (r[2] < 6 || r[3] < 6) {
                            active = false
                            area.queue_draw()
                            return
                        }
                        capture(r)
                    })
                    self.add_controller(drag)
                }}
                hexpand
                vexpand
            />
        </window>
    )
}
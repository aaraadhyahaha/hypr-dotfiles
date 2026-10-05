import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { timeout } from "ags/time"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import Pango from "gi://Pango"

const CACHE = `${GLib.get_home_dir()}/.cache/ags-clip`
const MAX = 8
GLib.mkdir_with_parents(CACHE, 0o755)

type Item = { id: string; text: string; image: boolean }

let toggleFn = () => { }
export const toggleClipboard = () => toggleFn()

const parse = (out: string): Item[] =>
    out.split("\n").filter(Boolean).slice(0, 300).map((line) => {
        const i = line.indexOf("\t")
        const text = line.slice(i + 1).replace(/\s+/g, " ").trim()
        return {
            id: line.slice(0, i),
            text,
            image: /^\[\[ binary data .*(png|jpg|jpeg|bmp|webp|gif)/i.test(text),
        }
    })

export default function Clipboard() {
    let win: Astal.Window
    let card: Gtk.Box
    let list: Gtk.Box
    let entry: Gtk.Entry
    let status: Gtk.Label
    let all: Item[] = []
    let results: Item[] = []
    let rows: Gtk.Box[] = []
    let sel = 0
    let closing = false

    const setSel = (i: number) => {
        if (!rows.length) return
        sel = (i + rows.length) % rows.length
        rows.forEach((r, idx) =>
            idx === sel ? r.add_css_class("sel") : r.remove_css_class("sel"))
    }

    const pick = (it?: Item) => {
        if (!it) return
        close()
        execAsync(["sh", "-c", 'cliphist decode "$1" | wl-copy', "sh", it.id]).catch(console.error)
    }

    const render = () => {
        let c
        while ((c = list.get_first_child())) list.remove(c)
        rows = []
        results.forEach((it, i) => {
            const row = new Gtk.Box()
            row.add_css_class("row")

            if (it.image) {
                const path = `${CACHE}/${it.id}.png`
                const pic = new Gtk.Picture()
                pic.set_content_fit(Gtk.ContentFit.COVER)
                pic.set_size_request(56, 40)
                pic.set_overflow(Gtk.Overflow.HIDDEN)
                pic.add_css_class("clip-thumb")
                if (GLib.file_test(path, GLib.FileTest.EXISTS)) pic.set_filename(path)
                else execAsync(["sh", "-c", 'cliphist decode "$1" > "$2"', "sh", it.id, path])
                    .then(() => pic.set_filename(path)).catch(console.error)
                row.append(pic)
            } else {
                const g = new Gtk.Label({ label: "\uf0ea" })
                g.add_css_class("icon")
                g.add_css_class("glyph")
                row.append(g)
            }

            const name = new Gtk.Label({
                label: it.image
                    ? "Image · " + it.text.replace(/^\[\[ binary data |\s*\]\]$/g, "")
                    : it.text,
                xalign: 0, valign: Gtk.Align.CENTER,
                maxWidthChars: 56, ellipsize: Pango.EllipsizeMode.END,
            })
            name.add_css_class("name")
            row.append(name)

            const click = new Gtk.GestureClick()
            click.connect("pressed", () => pick(it))
            row.add_controller(click)
            const motion = new Gtk.EventControllerMotion()
            motion.connect("enter", () => setSel(i))
            row.add_controller(motion)

            list.append(row)
            rows.push(row)
        })
        setSel(0)
    }

    const filter = (text: string) => {
        const q = text.trim().toLowerCase()
        results = all
            .filter((it) => !q || (it.image ? "image " : "") + it.text.toLowerCase() !== "" &&
                ((it.image ? "image " : "") + it.text).toLowerCase().includes(q))
            .slice(0, MAX)
        render()
        status.label = results.length ? "" : "Nothing copied yet"
        status.visible = !results.length
    }

    const close = () => {
        if (!win.visible || closing) return
        closing = true
        card.remove_css_class("pop")
        card.add_css_class("out")
        timeout(220, () => {
            win.visible = false
            card.remove_css_class("out")
            closing = false
        })
    }

    const open = () => {
        entry.set_text("")
        card.remove_css_class("pop")
        win.visible = true
        entry.grab_focus()
        timeout(16, () => card.add_css_class("pop"))
        execAsync(["cliphist", "list"])
            .then((out) => { all = parse(out); filter(entry.text) })
            .catch(() => { all = []; filter("") })
    }

    toggleFn = () => (win.visible ? close() : open())

    return (
        <window
            $={(self) => {
                win = self
                const key = new Gtk.EventControllerKey()
                key.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
                key.connect("key-pressed", (_, keyval) => {
                    if (keyval === Gdk.KEY_Escape) { close(); return true }
                    if (keyval === Gdk.KEY_Down) { setSel(sel + 1); return true }
                    if (keyval === Gdk.KEY_Up) { setSel(sel - 1); return true }
                    return false
                })
                self.add_controller(key)
            }}
            visible={false}
            name="clipboard"
            namespace="clipboard"
            class="Clip"
            layer={Astal.Layer.OVERLAY}
            keymode={Astal.Keymode.EXCLUSIVE}
            exclusivity={Astal.Exclusivity.IGNORE}
            application={app}
        >
            <box $={(self) => (card = self)} class="card" orientation={Gtk.Orientation.VERTICAL}>
                <entry
                    $={(self) => (entry = self)}
                    class="ffsearch"
                    placeholderText="Search clipboard..."
                    onNotifyText={(self) => filter(self.text)}
                    onActivate={() => pick(results[sel])}
                />
                <box $={(self) => (list = self)} class="list" orientation={Gtk.Orientation.VERTICAL} />
                <label $={(self) => (status = self)} class="empty" />
            </box>
        </window>
    )
}
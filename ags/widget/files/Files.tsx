import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { timeout } from "ags/time"
import { Motion, ENTER } from "../common/motion"
import { surfaceTop } from "../common/surface"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import Pango from "gi://Pango"

const HOME = GLib.get_home_dir()
const INDEX = `${HOME}/.cache/ags-files.txt`
const MAX = 8

let toggleFn = () => { }
export const toggleFiles = () => toggleFn()

export default function Files() {
    let win: Astal.Window
    let motion: Motion
    let list: Gtk.Box
    let entry: Gtk.Entry
    let status: Gtk.Label
    let results: string[] = []
    let rows: Gtk.Box[] = []
    let sel = 0
    let indexing = false
    let seq = 0
    let debounce: { cancel: () => void } | null = null

    const setSel = (i: number) => {
        if (!rows.length) return
        sel = (i + rows.length) % rows.length
        rows.forEach((r, idx) =>
            idx === sel ? r.add_css_class("sel") : r.remove_css_class("sel"))
    }

    const openPath = (path?: string) => {
        if (!path) return
        close()

        const isDir = GLib.file_test(path, GLib.FileTest.IS_DIR)
        execAsync(isDir ? ["nautilus", "--new-window", path] : ["xdg-open", path]).catch(console.error)
    }

    const render = () => {
        let c
        while ((c = list.get_first_child())) list.remove(c)
        rows = []
        results.forEach((path, i) => {
            const isDir = GLib.file_test(path, GLib.FileTest.IS_DIR)
            const [ct] = Gio.content_type_guess(path, null)
            const gicon = Gio.content_type_get_icon(isDir ? "inode/directory" : ct)

            const row = new Gtk.Box()
            row.add_css_class("row")
            const icon = new Gtk.Image({ gicon, pixelSize: 28 })
            icon.add_css_class("icon")
            const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.CENTER })
            const name = new Gtk.Label({
                label: GLib.path_get_basename(path), xalign: 0,
                maxWidthChars: 52, ellipsize: Pango.EllipsizeMode.END,
            })
            name.add_css_class("name")
            const desc = new Gtk.Label({
                label: GLib.path_get_dirname(path).replace(HOME, "~"), xalign: 0,
                maxWidthChars: 56, ellipsize: Pango.EllipsizeMode.MIDDLE,
            })
            desc.add_css_class("desc")
            text.append(name)
            text.append(desc)
            row.append(icon)
            row.append(text)

            const click = new Gtk.GestureClick()
            click.connect("pressed", () => openPath(path))
            row.add_controller(click)
            const motion = new Gtk.EventControllerMotion()
            motion.connect("enter", () => setSel(i))
            row.add_controller(motion)

            list.append(row)
            rows.push(row)
        })
        setSel(0)
    }

    const setStatus = () => {
        const q = entry.text.trim()
        status.label = results.length ? "" : !q ? "Type to search files" : indexing ? "Indexing..." : "No matches"
        status.visible = !results.length
    }

    const search = (text: string) => {
        debounce?.cancel()
        const q = text.trim()
        if (!q) {
            seq++
            results = []
            render()
            setStatus()
            return
        }
        debounce = timeout(100, () => {
            const my = ++seq
            const done = (out: string) => {
                if (my !== seq) return
                results = out.split("\n").filter(Boolean)
                render()
                setStatus()
            }
            execAsync([
                "sh", "-c",
                'fzf -i --scheme=path --filter "$1" < "$2" | head -n 8',
                "sh", q, INDEX,
            ]).then(done).catch(() => done(""))
        })
    }

    const reindex = () => {
        if (indexing) return
        indexing = true
        execAsync([
            "sh", "-c",
            'fd --type f --type d -E node_modules . "$HOME" > "$1.tmp" && mv "$1.tmp" "$1"',
            "sh", INDEX,
        ])
            .catch(console.error)
            .finally(() => {
                indexing = false
                if (win.visible) search(entry.text)
            })
    }

    const close = () => (win.visible = false) // instant; Hyprland fades the last frame

    const open = () => {
        reindex()
        entry.set_text("")
        results = []
        render()
        setStatus()
        motion.animate(ENTER.card)
        win.visible = true
        entry.grab_focus()
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
            name="files"
            namespace="files"
            class="Files"
            layer={Astal.Layer.OVERLAY}
            keymode={Astal.Keymode.EXCLUSIVE}
            exclusivity={Astal.Exclusivity.IGNORE}
            anchor={Astal.WindowAnchor.TOP}
            marginTop={surfaceTop()}
            application={app}
        >
            <Motion $={(self) => (motion = self)}>
                <box class="card" orientation={Gtk.Orientation.VERTICAL}>
                    <entry
                        $={(self) => (entry = self)}
                        class="ffsearch"
                        placeholderText="Search files..."
                        onNotifyText={(self) => search(self.text)}
                        onActivate={() => openPath(results[sel])}
                    />
                    <box $={(self) => (list = self)} class="list" orientation={Gtk.Orientation.VERTICAL} />
                    <label $={(self) => (status = self)} class="empty" />
                </box>
            </Motion>
        </window>
    )
}
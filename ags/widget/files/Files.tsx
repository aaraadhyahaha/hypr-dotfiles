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

// shared with the launcher's `/` mode
export const openPath = (path: string) => {
    const isDir = GLib.file_test(path, GLib.FileTest.IS_DIR)
    execAsync(isDir ? ["nautilus", "--new-window", path] : ["xdg-open", path]).catch(console.error)
}

export const showInFolder = (path: string) =>
    execAsync(["nautilus", "--select", path]).catch(console.error)

// fzf over the fd index, best first; "" or a missing index gives []
export const searchIndex = (q: string, max: number): Promise<string[]> =>
    execAsync([
        "sh", "-c",
        'fzf -i --scheme=path --filter "$1" < "$2" | head -n "$3"',
        "sh", q, INDEX, String(max),
    ])
        .then((out) => out.split("\n").filter(Boolean))
        .catch(() => [])

// one fd run at a time; callers that ask while it runs share it
let indexRun: Promise<void> | null = null
export const isIndexing = () => indexRun !== null
export const indexFiles = (): Promise<void> =>
    (indexRun ??= execAsync([
        "sh", "-c",
        'fd --type f --type d -E node_modules . "$HOME" > "$1.tmp" && mv "$1.tmp" "$1"',
        "sh", INDEX,
    ])
        .then(() => { })
        .catch(console.error)
        .finally(() => { indexRun = null }))

export default function Files() {
    let win: Astal.Window
    let motion: Motion
    let list: Gtk.Box
    let entry: Gtk.Entry
    let status: Gtk.Label
    let hint: Gtk.Label
    let results: string[] = []
    let rows: Gtk.Box[] = []
    let sel = 0
    let seq = 0
    let debounce: { cancel: () => void } | null = null

    const setSel = (i: number) => {
        if (!rows.length) return
        sel = (i + rows.length) % rows.length
        rows.forEach((r, idx) =>
            idx === sel ? r.add_css_class("sel") : r.remove_css_class("sel"))
    }

    const openSel = (path?: string) => {
        if (!path) return
        close()
        openPath(path)
    }

    const render = () => {
        let c
        while ((c = list.get_first_child())) list.remove(c)
        rows = []
        results.forEach((path, i) => {
            const isDir = GLib.file_test(path, GLib.FileTest.IS_DIR)
            const [ct] = Gio.content_type_guess(path, null)
            const gicon = Gio.content_type_get_icon(isDir ? "inode/directory" : ct)

            const row = new Gtk.Box({ spacing: 10 })
            row.add_css_class("row")
            const tile = new Gtk.Box({ valign: Gtk.Align.CENTER, hexpand: false, homogeneous: true })
            tile.add_css_class("lnch-tile")
            const icon = new Gtk.Image({ gicon, pixelSize: 18, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER })
            icon.add_css_class("icon")
            tile.append(icon)
            const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.CENTER, hexpand: true })
            const name = new Gtk.Label({
                label: GLib.path_get_basename(path), xalign: 0,
                widthChars: 1, maxWidthChars: 1, ellipsize: Pango.EllipsizeMode.END,
            })
            name.add_css_class("name")
            const desc = new Gtk.Label({
                label: GLib.path_get_dirname(path).replace(HOME, "~"), xalign: 0,
                widthChars: 1, maxWidthChars: 1, ellipsize: Pango.EllipsizeMode.MIDDLE,
            })
            desc.add_css_class("desc")
            text.append(name)
            text.append(desc)
            row.append(tile)
            row.append(text)

            const click = new Gtk.GestureClick()
            click.connect("pressed", () => openSel(path))
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
        status.label = results.length ? "" : !q ? "Type to search files" : isIndexing() ? "Indexing..." : "No matches"
        status.visible = !results.length
        hint.visible = isIndexing()
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
            searchIndex(q, MAX).then((paths) => {
                if (my !== seq) return
                results = paths
                render()
                setStatus()
            })
        })
    }

    const reindex = () => {
        hint.visible = true
        // joins a run the launcher already started
        indexFiles().then(() => {
            hint.visible = false
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
                    <box class="ffsearch" spacing={10}>
                        <label class="ffsearch-icon glyph" label={"\uf002"} />
                        <entry
                            $={(self) => (entry = self)}
                            hexpand
                            placeholderText="Search files…"
                            onNotifyText={(self) => search(self.text)}
                            onActivate={() => openSel(results[sel])}
                        />
                        <label $={(self) => (hint = self)} class="lnch-hint" label="Indexing…" visible={false} />
                    </box>
                    <box $={(self) => (list = self)} class="list" orientation={Gtk.Orientation.VERTICAL} />
                    <label $={(self) => (status = self)} class="empty" />
                </box>
            </Motion>
        </window>
    )
}
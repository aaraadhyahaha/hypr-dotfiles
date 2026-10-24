import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { Motion, ENTER } from "../common/motion"
import { surfaceTop } from "../common/surface"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import GdkPixbuf from "gi://GdkPixbuf"
import Pango from "gi://Pango"

const CACHE = `${GLib.get_home_dir()}/.cache/ags-clip`
const MAX = 8
// thumbnail box in the row; stored at 2x so it stays sharp on scaled outputs
const TW = 56
const TH = 36
GLib.mkdir_with_parents(CACHE, 0o755)

// cliphist previews binary entries as "[[ binary data 120 KiB png 1670x183 ]]"
const BINARY = /^\[\[ binary data (.*?)\s*\]\]$/
const IMAGE = /^(.+?) (png|jpe?g|bmp|webp|gif) (\d+)x(\d+)$/i

type Item = {
    line: string // the raw `cliphist list` line, which is what `cliphist delete` takes
    id: string
    text: string
    image?: { w: number; h: number; fmt: string; size: string }
    binary?: string
}

let toggleFn = () => { }
export const toggleClipboard = () => toggleFn()

const parse = (out: string): Item[] =>
    out.split("\n").filter((l) => l.includes("\t")).map((line) => {
        const i = line.indexOf("\t")
        const text = line.slice(i + 1).replace(/\s+/g, " ").trim()
        const item: Item = { line, id: line.slice(0, i), text }
        const bin = text.match(BINARY)
        if (bin) {
            const img = bin[1].match(IMAGE)
            if (img) item.image = { size: img[1], fmt: img[2].toUpperCase(), w: +img[3], h: +img[4] }
            else item.binary = bin[1]
        }
        return item
    })

const thumbPath = (id: string) => `${CACHE}/t${id}.png`

// decode to a temp file, scale it down to cover the thumbnail box, keep only the thumbnail:
// the full image would be megabytes on disk and a huge texture for a 56px tile
const pending = new Map<string, Promise<string>>()
const makeThumb = (id: string): Promise<string> => {
    const out = thumbPath(id)
    if (GLib.file_test(out, GLib.FileTest.EXISTS)) return Promise.resolve(out)
    if (pending.has(id)) return pending.get(id)!
    const raw = `${CACHE}/raw-${id}`
    const job = execAsync(["sh", "-c", 'cliphist decode "$1" > "$2"', "sh", id, raw])
        .then(() => {
            const [, w, h] = GdkPixbuf.Pixbuf.get_file_info(raw)
            if (!w || !h) throw new Error(`clipboard ${id}: not an image`)
            const s = Math.min(1, Math.max((TW * 2) / w, (TH * 2) / h))
            const pb = GdkPixbuf.Pixbuf.new_from_file_at_scale(
                raw, Math.max(1, Math.ceil(w * s)), Math.max(1, Math.ceil(h * s)), false)
            // write then rename, so an interrupted save never leaves a half thumbnail behind
            // (prune leaves raw-* alone while a decode is pending, so it is safe mid-write)
            pb.savev(`${raw}.png`, "png", [], [])
            GLib.rename(`${raw}.png`, out)
            return out
        })
        .finally(() => {
            GLib.unlink(raw)
            pending.delete(id)
        })
    pending.set(id, job)
    return job
}

// drop thumbnails (and the old full-size decodes) for entries cliphist no longer has, and
// any temp files a crash left behind, unless a decode is still writing one
const prune = (items: Item[]) => {
    const keep = new Set(items.filter((it) => it.image).map((it) => `t${it.id}.png`))
    try {
        const d = GLib.Dir.open(CACHE, 0)
        let n: string | null
        while ((n = d.read_name())) {
            if (!keep.has(n) && !(n.startsWith("raw-") && pending.size)) GLib.unlink(`${CACHE}/${n}`)
        }
    } catch (e) {
        console.error("clipboard cache:", e)
    }
}

export default function Clipboard() {
    let win: Astal.Window
    let motion: Motion
    let list: Gtk.Box
    let entry: Gtk.Entry
    let status: Gtk.Label
    let count: Gtk.Label
    let all: Item[] = []
    let results: Item[] = []
    let rows: Gtk.Box[] = []
    let sel = 0
    let failed = false

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

    const thumb = (it: Item) => {
        // an overlay child doesn't count towards the overlay's size, so the picture
        // is held to the TW×TH box whatever the image's own size is
        const box = new Gtk.Overlay({ widthRequest: TW, heightRequest: TH, valign: Gtk.Align.CENTER })
        box.overflow = Gtk.Overflow.HIDDEN
        box.add_css_class("clip-thumb")
        const pic = new Gtk.Picture({ contentFit: Gtk.ContentFit.COVER })
        box.add_overlay(pic)
        makeThumb(it.id)
            .then((path) => pic.set_paintable(Gdk.Texture.new_from_filename(path)))
            .catch(console.error)
        return box
    }

    const glyphTile = (glyph: string) => {
        const tile = new Gtk.Box({ valign: Gtk.Align.CENTER, hexpand: false, homogeneous: true })
        tile.add_css_class("lnch-tile")
        const g = new Gtk.Label({ label: glyph, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER })
        g.add_css_class("icon")
        g.add_css_class("glyph")
        tile.append(g)
        return tile
    }

    const label = (text: string, cls: string) => {
        // tiny natural width: hexpand fills the row, the card stays 520px
        const l = new Gtk.Label({
            label: text, xalign: 0, singleLineMode: true,
            widthChars: 1, maxWidthChars: 1, ellipsize: Pango.EllipsizeMode.END,
        })
        l.add_css_class(cls)
        return l
    }

    const render = () => {
        let c
        while ((c = list.get_first_child())) list.remove(c)
        rows = []
        results.forEach((it, i) => {
            const row = new Gtk.Box({ spacing: 10 })
            row.add_css_class("row")

            const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.CENTER, hexpand: true })
            if (it.image) {
                const { w, h, fmt, size } = it.image
                row.append(thumb(it))
                text.append(label("Image", "name"))
                text.append(label(`${w} × ${h} · ${fmt} · ${size}`, "desc"))
            } else if (it.binary !== undefined) {
                row.append(glyphTile(""))
                text.append(label("Binary data", "name"))
                if (it.binary) text.append(label(it.binary, "desc"))
            } else {
                row.append(glyphTile(""))
                text.append(label(it.text, "name"))
            }
            row.append(text)

            const click = new Gtk.GestureClick()
            click.connect("pressed", () => pick(it))
            row.add_controller(click)
            const hover = new Gtk.EventControllerMotion()
            hover.connect("enter", () => setSel(i))
            row.add_controller(hover)

            list.append(row)
            rows.push(row)
        })
    }

    const filter = (text: string, keep = 0) => {
        const q = text.trim().toLowerCase()
        results = all
            .filter((it) => !q || [
                it.image ? `image ${it.image.fmt} ${it.image.w}x${it.image.h}` : "",
                it.binary !== undefined ? "binary" : it.text,
            ].join(" ").toLowerCase().includes(q))
            .slice(0, MAX)
        render()
        setSel(Math.min(keep, results.length - 1))
        status.label = failed ? "cliphist isn't available"
            : !all.length ? "Nothing copied yet"
                : "No matches"
        status.visible = !results.length
    }

    const setCount = () => (count.label = `${all.length} ${all.length === 1 ? "item" : "items"}`)

    const remove = (it?: Item) => {
        if (!it) return
        const at = sel
        all = all.filter((x) => x !== it)
        setCount()
        filter(entry.text, at)
        execAsync(["sh", "-c", 'printf "%s\\n" "$1" | cliphist delete', "sh", it.line])
            .then(() => GLib.unlink(thumbPath(it.id)))
            .catch(console.error)
    }

    const close = () => (win.visible = false) // instant; Hyprland fades the last frame

    const open = () => {
        entry.set_text("")
        motion.animate(ENTER.card)
        win.visible = true
        entry.grab_focus()
        execAsync(["cliphist", "list"])
            .then((out) => { failed = false; all = parse(out); prune(all) })
            .catch(() => { failed = true; all = [] })
            .finally(() => { setCount(); filter(entry.text) })
    }

    toggleFn = () => (win.visible ? close() : open())

    return (
        <window
            $={(self) => {
                win = self
                const key = new Gtk.EventControllerKey()
                key.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
                key.connect("key-pressed", (_, keyval, _code, state) => {
                    if (keyval === Gdk.KEY_Escape) { close(); return true }
                    if (keyval === Gdk.KEY_Down) { setSel(sel + 1); return true }
                    if (keyval === Gdk.KEY_Up) { setSel(sel - 1); return true }
                    // shift+delete: plain delete still edits the search text
                    if (keyval === Gdk.KEY_Delete && state & Gdk.ModifierType.SHIFT_MASK) {
                        remove(results[sel])
                        return true
                    }
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
            anchor={Astal.WindowAnchor.TOP}
            marginTop={surfaceTop()}
            application={app}
        >
            <Motion $={(self) => (motion = self)}>
                <box class="card" orientation={Gtk.Orientation.VERTICAL}>
                    <box class="clip-header">
                        <label class="clip-title" label="Clipboard" hexpand xalign={0} />
                        <label $={(self) => (count = self)} class="clip-count" />
                    </box>
                    <box class="ffsearch" spacing={10}>
                        <label class="ffsearch-icon glyph" label={""} />
                        <entry
                            $={(self) => (entry = self)}
                            hexpand
                            placeholderText="Search clipboard…"
                            onNotifyText={(self) => filter(self.text)}
                            onActivate={() => pick(results[sel])}
                        />
                    </box>
                    <box $={(self) => (list = self)} class="list" orientation={Gtk.Orientation.VERTICAL} />
                    <label $={(self) => (status = self)} class="empty" visible={false} />
                </box>
            </Motion>
        </window>
    )
}

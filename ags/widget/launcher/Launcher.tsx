import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { timeout } from "ags/time"
import { enter, exit, exiting, MOTION } from "../common/motion"
import { readFile } from "ags/file"
import GLib from "gi://GLib"
import Pango from "gi://Pango"
import Apps from "gi://AstalApps"
import { toggleWallpapers } from "../wallpapers/Wallpapers"
import { toggleFiles } from "../files/Files"

type Item = {
    name: string
    description?: string | null
    iconName?: string | null
    launch: () => unknown
}

const WALLPAPER_ITEM: Item = {
    name: "Wallpapers",
    description: "Pick a wallpaper",
    iconName: "preferences-desktop-wallpaper",
    launch: () => timeout(MOTION.exit, () => toggleWallpapers()),
}

const FILES_ITEM: Item = {
    name: "Search Files",
    description: "Fuzzy find files and folders",
    iconName: "system-file-manager",
    launch: () => timeout(MOTION.exit, () => toggleFiles()),
}

const MAX = 40
let toggleFn = () => { }
export const toggleLauncher = () => toggleFn()

export default function Launcher() {
    const apps = new Apps.Apps()
    let win: Astal.Window
    let card: Gtk.Box
    let list: Gtk.Box
    let entry: Gtk.Entry
    let provider: Gtk.CssProvider | null = null
    let results: Item[] = []
    let scroller: Gtk.ScrolledWindow
    let armed = false
    let lastX: number | null = null
    let lastY: number | null = null
    let rows: Gtk.Box[] = []
    let sel = 0

    const close = () => exit(card, () => (win.visible = false))

    const setSel = (i: number) => {
        if (!rows.length) return
        sel = (i + rows.length) % rows.length
        rows.forEach((r, idx) =>
            idx === sel ? r.add_css_class("sel") : r.remove_css_class("sel"))
        const a = rows[sel].get_allocation()
        const adj = scroller.get_vadjustment()
        if (a.y < adj.value) adj.value = a.y
        else if (a.y + a.height > adj.value + adj.page_size)
            adj.value = a.y + a.height - adj.page_size
    }

    const launch = (a?: Item) => {
        if (!a) return
        close()
        a.launch()
    }

    const render = () => {
        armed = false
        scroller.get_vadjustment().set_value(0)
        let c
        while ((c = list.get_first_child())) list.remove(c)
        rows = []
        results.forEach((a, i) => {
            const row = new Gtk.Box()
            row.add_css_class("row")
            const icon = new Gtk.Image({ iconName: a.iconName ?? "application-x-executable", pixelSize: 32 })
            icon.add_css_class("icon")
            const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.CENTER })
            const name = new Gtk.Label({ label: a.name, xalign: 0 })
            name.add_css_class("name")
            text.append(name)
            if (a.description) {
                const d = new Gtk.Label({
                    label: a.description, xalign: 0,
                    maxWidthChars: 48, ellipsize: Pango.EllipsizeMode.END,
                })
                d.add_css_class("desc")
                text.append(d)
            }
            row.append(icon)
            row.append(text)
            const click = new Gtk.GestureClick()
            click.connect("pressed", () => launch(a))
            row.add_controller(click)
            const motion = new Gtk.EventControllerMotion()
            motion.connect("enter", () => { if (armed) setSel(i) })
            row.add_controller(motion)
            list.append(row)
            rows.push(row)
        })
        setSel(0)
    }

    const search = (text: string) => {
        const q = text.trim().toLowerCase()
        const found: Item[] = (text ? apps.fuzzy_query(text) : apps.list).slice(0, MAX)
        const extras: Item[] = []
        if (q.length >= 2 && "wallpapers".startsWith(q)) extras.push(WALLPAPER_ITEM)
        if (q.length >= 2 && ("search files".startsWith(q) || "find files".startsWith(q))) extras.push(FILES_ITEM)
        results = [...extras, ...found].slice(0, MAX)
        render()
    }

    const open = () => {
        armed = false; lastX = null; lastY = null
        try {
            const p = readFile(`${GLib.get_home_dir()}/.cache/last_wall`).trim()
            const display = Gdk.Display.get_default()!
            if (provider) Gtk.StyleContext.remove_provider_for_display(display, provider)
            provider = new Gtk.CssProvider()
            provider.load_from_string(
                `.hero-img { background-image: url("file://${p}"); background-size: cover; background-position: center; }`,
            )
            Gtk.StyleContext.add_provider_for_display(
                display,
                provider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 1,
            )
        } catch (e) {
            console.error("wallpaper error:", e)
        }
        apps.reload()
        entry.set_text("")
        search("")
        enter(card)
        win.visible = true
        entry.grab_focus()
    }

    toggleFn = () => (win.visible && !exiting(card) ? close() : open())

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

                const mv = new Gtk.EventControllerMotion()
                mv.connect("motion", (_, x, y) => {
                    if (lastX !== null && (x !== lastX || y !== lastY)) armed = true
                    lastX = x
                    lastY = y
                })
                self.add_controller(mv)
            }}
            visible={false}
            name="launcher"
            namespace="launcher"
            class="Launcher"
            layer={Astal.Layer.OVERLAY}
            keymode={Astal.Keymode.EXCLUSIVE}
            exclusivity={Astal.Exclusivity.IGNORE}
            application={app}
        >
            <box
                $={(self) => (card = self)}
                class="card"
                orientation={Gtk.Orientation.VERTICAL}
            >
                <overlay class="hero" overflow={Gtk.Overflow.HIDDEN}>
                    <box class="hero-img" widthRequest={480} heightRequest={110} />
                    <entry
                        $type="overlay"
                        $={(self) => (entry = self)}
                        placeholderText="Search..."
                        valign={Gtk.Align.CENTER}
                        onNotifyText={(self) => search(self.text)}
                        onActivate={() => launch(results[sel])}
                    />
                </overlay>
                <scrolledwindow
                    $={(self) => (scroller = self)}
                    propagateNaturalHeight
                    maxContentHeight={380}
                    hscrollbarPolicy={Gtk.PolicyType.NEVER}
                >
                    <box $={(self) => (list = self)} class="list" orientation={Gtk.Orientation.VERTICAL} />
                </scrolledwindow>
            </box>
        </window>
    )
}
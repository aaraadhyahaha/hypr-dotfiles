import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { Motion, ENTER } from "../common/motion"
import { surfaceTop } from "../common/surface"
import Pango from "gi://Pango"
import Apps from "gi://AstalApps"
import { toggleWallpapers } from "../wallpapers/Wallpapers"
import { toggleFiles } from "../files/Files"
import { timeout } from "ags/time"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import { readFile, writeFile } from "ags/file"
import { parseQuery, looksLikeMath, cleanCalc, qalcExpr, webUrl, parseEmojiData, searchEmoji, bump, rank, type Emoji, type Frecency, type Item } from "./model"
import { parseAction, riskyPrefix } from "./actionsModel"
import { actionItems, refreshActions } from "./actions"
import emojiTsv from "./emojiData"

const FRECENCY_FILE = `${GLib.get_home_dir()}/.cache/ags-launcher.json`
// fuzzy order wins past this many apps; frecency only reorders the top few
const APP_WINDOW = 8

// loaded once at startup, then kept in memory
let frecency: Frecency = (() => {
    try { return JSON.parse(readFile(FRECENCY_FILE)) } catch { return {} }
})()

const saveFrecency = () => {
    try { writeFile(FRECENCY_FILE, JSON.stringify(frecency)) } catch (e) { console.error(e) }
}

const copy = (text: string) => execAsync(["wl-copy", text]).catch(console.error)
const openUrl = (url: string) => execAsync(["xdg-open", url]).catch(console.error)

const webItem = (q: string): Item => ({
    name: `Search Google for "${q}"`,
    iconName: "web-browser",
    launch: () => openUrl(webUrl(q)),
})

const calcItem = (q: string, result: string): Item => ({
    name: result,
    description: q,
    iconName: "accessories-calculator",
    launch: () => copy(result),
    alt: () => copy(`${q} = ${result}`),
})

const EMOJI = parseEmojiData(emojiTsv)

const emojiItem = (e: Emoji): Item => ({
    key: `emoji:${e.glyph}`,
    name: e.name,
    glyph: e.glyph,
    launch: () => copy(e.glyph),
})

// setsid -f detaches the command so it outlives the launcher and execAsync returns at once
const runDetached = (cmd: string) =>
    execAsync(["setsid", "-f", "sh", "-c", cmd]).catch(console.error)
const runInTerminal = (cmd: string) =>
    execAsync(["setsid", "-f", "kitty", "--hold", "sh", "-c", cmd]).catch(console.error)

const shellItems = (cmd: string): Item[] => [
    {
        name: `Run ${cmd}`,
        description: "Shift+Enter: run in terminal",
        iconName: "utilities-terminal",
        launch: () => runDetached(cmd),
        alt: () => runInTerminal(cmd),
    },
    {
        name: "Run in terminal",
        description: cmd,
        iconName: "utilities-terminal",
        launch: () => runInTerminal(cmd),
    },
]

const WALLPAPER_ITEM: Item = {
    name: "Wallpapers",
    description: "Pick a wallpaper",
    iconName: "preferences-desktop-wallpaper",
    launch: () => toggleWallpapers(),
}

const FILES_ITEM: Item = {
    name: "Search Files",
    description: "Fuzzy find files and folders",
    iconName: "system-file-manager",
    launch: () => toggleFiles(),
}

const MAX = 40
let toggleFn = (_prefill?: string) => { }
export const toggleLauncher = (prefill?: string) => toggleFn(prefill)

export default function Launcher() {
    const apps = new Apps.Apps()
    let win: Astal.Window
    let motion: Motion
    let list: Gtk.Box
    let entry: Gtk.Entry
    let results: Item[] = []
    let scroller: Gtk.ScrolledWindow
    let armed = false
    let lastX: number | null = null
    let lastY: number | null = null
    let rows: Gtk.Box[] = []
    let sel = 0
    let modeLabel: Gtk.Label
    let debounce: { cancel: () => void } | null = null
    let seq = 0

    // hiding is instant; Hyprland fades the last frame out
    const close = () => (win.visible = false)

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

    const launch = (a?: Item, alt = false) => {
        if (!a) return
        const fn = alt ? a.alt : a.launch
        if (!fn) return
        if (a.key) {
            frecency = bump(frecency, a.key, Date.now())
            saveFrecency()
        }
        close()
        fn()
    }

    const render = () => {
        armed = false
        scroller.get_vadjustment().set_value(0)
        let c
        while ((c = list.get_first_child())) list.remove(c)
        rows = []
        results.forEach((a, i) => {
            const row = new Gtk.Box({ spacing: 12 })
            row.add_css_class("lnch-row")
            // 32px tile holding the app's own icon
            const tile = new Gtk.Box({ valign: Gtk.Align.CENTER, homogeneous: true })
            tile.add_css_class("lnch-tile")
            if (a.glyph) {
                const g = new Gtk.Label({ label: a.glyph })
                g.add_css_class("glyph")
                tile.append(g)
            } else if (a.symbol) {
                const s = new Gtk.Label({ label: a.symbol })
                s.add_css_class("icon")
                s.add_css_class("fill")
                s.add_css_class("symbol")
                tile.append(s)
            } else {
                tile.append(new Gtk.Image({ iconName: a.iconName ?? "application-x-executable", pixelSize: 20 }))
            }
            const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.CENTER, hexpand: true })
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
            row.append(tile)
            row.append(text)
            if (a.level !== undefined) {
                const meter = new Gtk.ProgressBar({ fraction: a.level, valign: Gtk.Align.CENTER })
                meter.add_css_class("lnch-level")
                row.append(meter)
            }
            if (a.launch) {
                const hint = new Gtk.Label({ label: a.hint ? `↵ ${a.hint}` : "↵", valign: Gtk.Align.CENTER })
                hint.add_css_class("lnch-hint")
                row.append(hint)
            } else {
                row.add_css_class("info")
            }
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
        // a layer-shell surface keeps its largest size; re-measure so the card hugs the list
        win.set_default_size(-1, -1)
        win.queue_resize()
    }

    const MODE_LABEL: Record<string, string> = { calc: "Calc", emoji: "Emoji", shell: "Run", web: "Web", fx: "fx" }

    // qalc runs after a short pause; `seq` drops answers for stale input
    const calc = (q: string, done: (it: Item | null) => void) => {
        debounce?.cancel()
        const my = ++seq
        debounce = timeout(100, () => {
            execAsync(["qalc", "-t", qalcExpr(q)])
                .then((out) => {
                    if (my !== seq) return
                    const r = cleanCalc(q, out)
                    done(r ? calcItem(q, r) : null)
                })
                .catch(() => { if (my === seq) done(null) })
        })
    }

    const search = (text: string) => {
        const { mode, q } = parseQuery(text)
        debounce?.cancel()
        seq++
        const label = MODE_LABEL[mode]
        modeLabel.label = label ?? "Esc"
        if (label) modeLabel.add_css_class("mode")
        else modeLabel.remove_css_class("mode")

        if (mode === "calc") {
            results = []
            render()
            if (q) calc(q, (it) => { if (it) { results = [it]; render() } })
            return
        }
        if (mode === "emoji") {
            // with no query, show the most used first; otherwise keep match tiers
            const hits = searchEmoji(EMOJI, q, MAX).map(emojiItem)
            results = rank(hits, frecency, Date.now(), (i) => i.key!, q ? 0 : hits.length)
            render()
            return
        }
        if (mode === "shell") {
            results = q ? shellItems(q) : []
            render()
            return
        }
        if (mode === "web") {
            results = q ? [webItem(q)] : []
            render()
            return
        }
        if (mode === "fx") {
            // fx rows land in the next step; until then the mode only shows its pill
            results = []
            render()
            return
        }

        const t = text.trim()
        const lq = t.toLowerCase()
        const matches: Item[] = (t ? apps.fuzzy_query(t) : apps.list).slice(0, MAX).map((a): Item => ({
            key: `app:${a.entry}`,
            name: a.name,
            description: a.description,
            iconName: a.iconName,
            launch: () => a.launch(),
        }))
        const found = rank(matches, frecency, Date.now(), (i) => i.key!, t ? APP_WINDOW : matches.length)
        const extras: Item[] = []
        if (lq.length >= 2 && "wallpapers".startsWith(lq)) extras.push(WALLPAPER_ITEM)
        if (lq.length >= 2 && ("search files".startsWith(lq) || "find files".startsWith(lq))) extras.push(FILES_ITEM)
        // a typed quick action ranks first, except a session-ender reached by prefix ("reb"),
        // which waits below the apps so a quick Enter can't fire it
        const intent = parseAction(t)
        const acts = intent ? actionItems(intent) : []
        const risky = intent ? riskyPrefix(t, intent) : false
        const base = [...(risky ? [] : acts), ...extras, ...found].slice(0, MAX)
        const tail = [...(risky ? acts : []), ...(t ? [webItem(t)] : [])]
        results = [...base, ...tail]
        render()
        if (looksLikeMath(t)) {
            calc(t, (it) => {
                if (!it) return
                results = [it, ...base, ...tail]
                render()
            })
        }
    }

    const open = (prefill = "") => {
        armed = false; lastX = null; lastY = null
        apps.reload()
        refreshActions()
        entry.set_text(prefill)
        entry.set_position(-1)
        search(prefill)
        motion.animate(ENTER.card)
        win.visible = true
        entry.grab_focus()
    }

    toggleFn = (prefill) => (win.visible ? close() : open(prefill))

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
                    if ((keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) && state & Gdk.ModifierType.SHIFT_MASK) {
                        launch(results[sel], true)
                        return true
                    }
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
            // pinned from the top, so the search field holds still while results change height
            anchor={Astal.WindowAnchor.TOP}
            marginTop={surfaceTop()}
            application={app}
        >
            <Motion $={(self) => (motion = self)}>
                <box class="lnch" orientation={Gtk.Orientation.VERTICAL}>
                    <box class="lnch-search" spacing={12}>
                        <label class="icon lnch-search-icon" label="search" />
                        <entry
                            $={(self) => (entry = self)}
                            hexpand
                            placeholderText="Search apps…"
                            onNotifyText={(self) => search(self.text)}
                            onActivate={() => launch(results[sel])}
                        />
                        <label $={(self) => (modeLabel = self)} class="lnch-key" valign={Gtk.Align.CENTER} label="Esc" />
                    </box>
                    <scrolledwindow
                        $={(self) => (scroller = self)}
                        propagateNaturalHeight
                        maxContentHeight={380}
                        hscrollbarPolicy={Gtk.PolicyType.NEVER}
                    >
                        <box $={(self) => (list = self)} class="lnch-list" orientation={Gtk.Orientation.VERTICAL} />
                    </scrolledwindow>
                </box>
            </Motion>
        </window>
    )
}
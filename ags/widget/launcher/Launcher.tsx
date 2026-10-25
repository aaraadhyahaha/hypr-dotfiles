import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { Motion, ENTER } from "../common/motion"
import { surfaceTop } from "../common/surface"
import Pango from "gi://Pango"
import Apps from "gi://AstalApps"
import { toggleWallpapers } from "../wallpapers/Wallpapers"
import { toggleFiles, openPath, showInFolder, searchIndex, indexFiles, isIndexing } from "../files/Files"
import { timeout } from "ags/time"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { readFile, writeFile } from "ags/file"
import { parseQuery, looksLikeMath, cleanCalc, qalcExpr, webUrl, parseEmojiData, searchEmoji, bump, rank, type Emoji, type Frecency, type Item } from "./model"
import { parseAction, parseFxQuery, riskyPrefix } from "./actionsModel"
import { actionItems, refreshActions } from "./actions"
import { fxItems } from "./fxItems"
import { type Recent, matchRecent, mergePaths, tildePath } from "./filesModel"
import { listRecent, addRecent, fileIcon, loadPreview, emptyPreview, PREVIEW_W } from "./preview"
import { fxStatus, fxProblem, useFx, refreshFx } from "../../service/fx"
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

const fileItem = (path: string): Item => ({
    name: GLib.path_get_basename(path),
    description: tildePath(GLib.path_get_dirname(path), GLib.get_home_dir()),
    preview: path,
    hint: "Open",
    launch: () => { addRecent(path); openPath(path) },
    altHint: "Show in folder",
    alt: () => showInFolder(path),
})

const NO_RECENT: Item = { name: "No recent files yet", description: "Type to search your home folder", symbol: "history" }
const SEARCHING: Item = { name: "Searching…", symbol: "search" }
const INDEXING: Item = { name: "Indexing your files…", description: "Matches show up as soon as it's done", symbol: "hourglass_empty" }
const noMatch = (q: string): Item => ({ name: `No files match “${q}”`, description: "Try fewer or different letters", symbol: "search_off" })

const MAX = 40
// the list's max height; the preview pane is exactly this tall, so the card never jumps
const LIST_H = 380
// the recent list is read once per open, newest first
const RECENT_MAX = 200
// a row's identity across re-renders (two files can share a name)
const idOf = (a?: Item) => a?.preview ?? a?.name
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
    let body: Gtk.Box
    let pane: Gtk.Box
    let paneMotion: Motion
    // what the pane shows (a path, or "" for the placeholder) and the load in flight
    let paneFor: string | null = null
    let paneCancel: Gio.Cancellable | null = null
    let recent: Recent[] | null = null
    let indexed = false

    const swapPane = (w: Gtk.Widget) => {
        let c
        while ((c = paneMotion.get_first_child())) paneMotion.remove(c)
        paneMotion.append(w)
        paneMotion.animate(ENTER.swap)
    }

    // the old content stays until the new one is ready, so arrowing never shows a blank pane
    const showPreview = (a?: Item) => {
        if (!pane.visible) return
        const path = a?.preview ?? ""
        if (path === paneFor) return
        paneFor = path
        paneCancel?.cancel()
        paneCancel = null
        if (!path) return swapPane(emptyPreview("draft", "Select a file to preview it"))
        const cancel = (paneCancel = new Gio.Cancellable())
        loadPreview(path, win.get_scale_factor(), cancel)
            .then((w) => { if (!cancel.is_cancelled()) swapPane(w) })
            .catch((e) => {
                if (cancel.is_cancelled()) return
                console.error("launcher preview:", path, e)
                swapPane(emptyPreview("error", "Can't preview this file"))
            })
    }

    const setPane = (on: boolean) => {
        if (pane.visible === on) return
        pane.visible = on
        // .wide: the card makes room for the pane
        const card = body.get_parent()!
        if (on) card.add_css_class("wide")
        else {
            card.remove_css_class("wide")
            paneCancel?.cancel()
            paneCancel = null
            paneFor = null
        }
    }

    // hiding is instant; Hyprland fades the last frame out
    const close = () => (win.visible = false)

    const setSel = (i: number) => {
        if (!rows.length) return
        sel = (i + rows.length) % rows.length
        rows.forEach((r, idx) =>
            idx === sel ? r.add_css_class("sel") : r.remove_css_class("sel"))
        showPreview(results[sel])
        const a = rows[sel].get_allocation()
        const adj = scroller.get_vadjustment()
        if (a.y < adj.value) adj.value = a.y
        else if (a.y + a.height > adj.value + adj.page_size)
            adj.value = a.y + a.height - adj.page_size
    }

    const launch = (a?: Item, key: "launch" | "alt" | "extra" = "launch") => {
        if (!a) return
        const fn = a[key]
        if (!fn) return
        if (a.key) {
            frecency = bump(frecency, a.key, Date.now())
            saveFrecency()
        }
        if (!a.stay) close()
        fn()
    }

    // `keep`: the name of the row to stay on, for a data refresh under an unchanged query
    const render = (keep?: string) => {
        armed = false
        if (keep === undefined) scroller.get_vadjustment().set_value(0)
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
            } else if (a.preview) {
                tile.append(new Gtk.Image({ gicon: fileIcon(a.preview), pixelSize: 20 }))
            } else {
                tile.append(new Gtk.Image({ iconName: a.iconName ?? "application-x-executable", pixelSize: 20 }))
            }
            const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.CENTER, hexpand: true })
            // file rows take the width they're given, so a long name can't widen the card;
            // the middle of a folder path is the part worth losing
            const fit = a.preview ? { widthChars: 1, maxWidthChars: 1 } : { maxWidthChars: 48 }
            const name = new Gtk.Label({ label: a.name, xalign: 0, ...fit, ellipsize: Pango.EllipsizeMode.END })
            name.add_css_class("name")
            text.append(name)
            if (a.description) {
                const d = new Gtk.Label({
                    label: a.description, xalign: 0, ...fit,
                    ellipsize: a.preview ? Pango.EllipsizeMode.MIDDLE : Pango.EllipsizeMode.END,
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
                const keys = [
                    a.hint ? `↵ ${a.hint}` : "↵",
                    a.alt && a.altHint && `⇧↵ ${a.altHint}`,
                    a.extra && a.extraHint && `Alt↵ ${a.extraHint}`,
                ].filter(Boolean).join("   ")
                const hint = new Gtk.Label({ label: keys, valign: Gtk.Align.CENTER })
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
        const kept = keep === undefined ? -1 : results.findIndex((r) => idOf(r) === keep)
        setSel(Math.max(0, kept))
        // a layer-shell surface keeps its largest size; re-measure so the card hugs the list
        win.set_default_size(-1, -1)
        win.queue_resize()
    }

    const MODE_LABEL: Record<string, string> = { calc: "Calc", emoji: "Emoji", shell: "Run", web: "Web", fx: "fx", files: "Files" }

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

    const search = (text: string, keep?: string) => {
        const { mode, q } = parseQuery(text)
        debounce?.cancel()
        seq++
        const label = MODE_LABEL[mode]
        modeLabel.label = label ?? "Esc"
        if (label) modeLabel.add_css_class("mode")
        else modeLabel.remove_css_class("mode")
        setPane(mode === "files")

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
        if (mode === "files") {
            filesSearch(q, keep)
            return
        }
        if (mode === "fx") {
            // fresh numbers once per open; rows re-render when they land (see fxChanged)
            if (!fxFetched) {
                fxFetched = true
                useFx()
                refreshFx()
            }
            results = fxItems(parseFxQuery(q))
            render(keep)
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
        if (lq.length >= 2 && "recent files".startsWith(lq)) extras.push(recentItem)
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

    // opens files mode in place
    const recentItem: Item = {
        name: "Recent Files",
        description: "Browse and preview them · type / to search",
        iconName: "document-open-recent",
        hint: "Browse",
        stay: true,
        launch: () => { entry.set_text("/"); entry.set_position(-1) },
    }

    // recent matches show at once; the fd index's answer follows and merges in below them
    const filesSearch = (q: string, keep?: string) => {
        if (!indexed) {
            // the index refreshes once per open; whatever's on screen re-runs when it lands
            indexed = true
            indexFiles().then(() => {
                if (win.visible && parseQuery(entry.text).mode === "files") search(entry.text, idOf(results[sel]))
            })
        }
        recent ??= listRecent(RECENT_MAX)
        const hits = matchRecent(recent, q, MAX).map((r) => r.path)
        if (!q) {
            results = hits.length ? hits.map(fileItem) : [NO_RECENT]
            render(keep)
            return
        }
        // nothing recent matches: keep the last file rows up until the index answers, so typing doesn't flash
        if (hits.length || !results.some((r) => r.preview)) {
            results = hits.length ? hits.map(fileItem) : [SEARCHING]
            render(keep)
        }
        const my = seq
        debounce = timeout(100, () => {
            searchIndex(q, MAX).then((paths) => {
                if (my !== seq) return
                const cur = idOf(results[sel])
                const all = mergePaths(hits, paths, MAX)
                results = all.length ? all.map(fileItem) : [isIndexing() ? INDEXING : noMatch(q)]
                render(cur)
            })
        })
    }

    // fx data that lands while fx rows are shown re-renders them in place
    let fxFetched = false
    const fxChanged = () => {
        if (win?.visible && parseQuery(entry.text).mode === "fx") search(entry.text, idOf(results[sel]) ?? "")
    }
    fxStatus.subscribe(fxChanged)
    fxProblem.subscribe(fxChanged)

    const open = (prefill = "") => {
        armed = false; lastX = null; lastY = null
        fxFetched = false
        recent = null
        indexed = false
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
                        launch(results[sel], "alt")
                        return true
                    }
                    if ((keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) && state & Gdk.ModifierType.ALT_MASK) {
                        launch(results[sel], "extra")
                        return true
                    }
                    // Ctrl+C on a file row copies its path, unless there's text selected to copy
                    const path = results[sel]?.preview
                    if (keyval === Gdk.KEY_c && state & Gdk.ModifierType.CONTROL_MASK && path && !entry.get_selection_bounds()[0]) {
                        close()
                        copy(path)
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
                    <box $={(self) => (body = self)} class="lnch-body" spacing={8}>
                        <scrolledwindow
                            $={(self) => (scroller = self)}
                            hexpand
                            propagateNaturalHeight
                            maxContentHeight={LIST_H}
                            hscrollbarPolicy={Gtk.PolicyType.NEVER}
                        >
                            <box $={(self) => (list = self)} class="lnch-list" orientation={Gtk.Orientation.VERTICAL} />
                        </scrolledwindow>
                        <box
                            $={(self) => (pane = self)}
                            class="lnch-preview"
                            visible={false}
                            valign={Gtk.Align.START}
                            heightRequest={LIST_H}
                        >
                            <Motion $={(self) => (paneMotion = self)} widthRequest={PREVIEW_W} hexpand={false} />
                        </box>
                    </box>
                </box>
            </Motion>
        </window>
    )
}
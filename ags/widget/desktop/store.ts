import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"
import { DEFAULT_LAYOUT, entry, sizesOf } from "./catalog"
import {
  firstFree,
  fits,
  makeId,
  NOMINAL,
  nearestFree,
  parseLayout,
  reflow,
  serialize,
  type Cell,
  type Grid,
  type Item,
  type Size,
} from "./layout"

// The desktop layout: which widgets, where, at what size, with what settings.
// Saved to ~/.local/state/ags/desktop.json, debounced and atomic.

const DIR = `${GLib.get_user_state_dir()}/ags`
const FILE = `${DIR}/desktop.json`
const SAVE_MS = 300

function load(): Item[] {
  let text: string
  try {
    const [ok, bytes] = GLib.file_get_contents(FILE)
    if (!ok) return [...DEFAULT_LAYOUT]
    text = new TextDecoder().decode(bytes)
  } catch {
    return [...DEFAULT_LAYOUT] // first run
  }
  const items = parseLayout(text, sizesOf)
  if (items) return items
  // unreadable: keep it for inspection and start over rather than refuse to show a desktop
  console.error(`desktop: ${FILE} is corrupt; saved as desktop.json.bak, using the default layout`)
  try {
    Gio.File.new_for_path(FILE).move(Gio.File.new_for_path(`${FILE}.bak`), Gio.FileCopyFlags.OVERWRITE, null, null)
  } catch (e) {
    console.error("desktop: backup failed", e)
  }
  return [...DEFAULT_LAYOUT]
}

// unstretched 1536x816 cells until the surface reports its real size
const [grid, setGridState] = createState<Grid>(NOMINAL)
export { grid }
let measured = false

const [items, setItems] = createState<Item[]>(reflow(load(), NOMINAL))
export { items }
let pending = 0

function save() {
  if (pending) GLib.source_remove(pending)
  pending = GLib.timeout_add(GLib.PRIORITY_LOW, SAVE_MS, () => {
    pending = 0
    try {
      GLib.mkdir_with_parents(DIR, 0o755)
      GLib.file_set_contents(FILE, new TextEncoder().encode(serialize(items.get())))
    } catch (e) {
      console.error("desktop: save failed", e)
    }
    return GLib.SOURCE_REMOVE
  })
}

function commit(next: Item[]) {
  setItems(next)
  save()
}

const patch = (id: string, change: Partial<Item>) =>
  commit(items.get().map((it) => (it.id === id ? { ...it, ...change } : it)))

export const getGrid = () => grid.get()

// the desktop surface knows its real size only once it's allocated
export function setGrid(g: Grid) {
  const cur = grid.get()
  if (measured && g.cols === cur.cols && g.rows === cur.rows && g.px === cur.px && g.py === cur.py) return
  measured = true
  setGridState(g)
  const next = reflow(items.get(), g)
  if (next.some((it, i) => it !== items.get()[i])) commit(next)
}

// where a widget of `size` would land if dropped aiming at `target`
export const slotFor = (id: string | null, size: Size, target: Cell) =>
  nearestFree(items.get(), id, size, target, grid.get())

// target: aim near a cell (a drop); else the first free spot from the top-left
export function add(kind: string, size: Size, target?: Cell, config?: Record<string, unknown>): string | null {
  const e = entry(kind)
  if (!e || !e.sizes.includes(size)) return null
  const spot = target ? slotFor(null, size, target) : firstFree(items.get(), size, grid.get())
  if (!spot) return null
  const id = makeId(kind, items.get())
  commit([...items.get(), { id, kind, size, ...spot, config: config ?? e.defaultConfig?.() ?? {} }])
  return id
}

export function move(id: string, cell: Cell) {
  const it = items.get().find((i) => i.id === id)
  if (it && fits(items.get(), { ...cell, size: it.size }, grid.get(), id)) patch(id, cell)
}

// keeps its corner when the new size fits there, else the nearest spot; false: no room anywhere
export function resize(id: string, size: Size): boolean {
  const it = items.get().find((i) => i.id === id)
  if (!it || !entry(it.kind)?.sizes.includes(size)) return false
  if (size === it.size) return true
  const spot = slotFor(id, size, it)
  if (!spot) return false
  patch(id, { size, ...spot })
  return true
}

export const remove = (id: string) => commit(items.get().filter((it) => it.id !== id))

export function setConfig(id: string, change: Record<string, unknown>) {
  const it = items.get().find((i) => i.id === id)
  if (it) patch(id, { config: { ...it.config, ...change } })
}

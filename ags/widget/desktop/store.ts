import GLib from "gi://GLib"
import Gio from "gi://Gio"
import { createState } from "ags"
import { DEFAULT_LAYOUT, entry, sizesOf } from "./catalog"
import {
  adapt,
  firstFree,
  fits,
  makeId,
  NOMINAL,
  nearestFree,
  parseExtent,
  parseLayout,
  serialize,
  type Cell,
  type Extent,
  type Grid,
  type Item,
  type Size,
} from "./layout"

// The desktop layout: which widgets, where, at what size, with what settings.
// Saved to ~/.local/state/ags/desktop.json, debounced and atomic.

const DIR = `${GLib.get_user_state_dir()}/ags`
const FILE = `${DIR}/desktop.json`
const SAVE_MS = 300

// extent: the grid the layout was arranged on; null until known (first run, or an older file)
function load(): { items: Item[]; extent: Extent | null } {
  const fresh = () => ({ items: [...DEFAULT_LAYOUT], extent: null })
  let text: string
  try {
    const [ok, bytes] = GLib.file_get_contents(FILE)
    if (!ok) return fresh()
    text = new TextDecoder().decode(bytes)
  } catch {
    return fresh() // first run
  }
  const items = parseLayout(text, sizesOf)
  if (items) return { items, extent: parseExtent(text) }
  // unreadable: keep it for inspection and start over rather than refuse to show a desktop
  console.error(`desktop: ${FILE} is corrupt; saved as desktop.json.bak, using the default layout`)
  try {
    Gio.File.new_for_path(FILE).move(Gio.File.new_for_path(`${FILE}.bak`), Gio.FileCopyFlags.OVERWRITE, null, null)
  } catch (e) {
    console.error("desktop: backup failed", e)
  }
  return fresh()
}

// unstretched 1536x816 cells until the surface reports its real size
const [grid, setGridState] = createState<Grid>(NOMINAL)
export { grid }
let measured = false

// `saved` is the layout as arranged on `extent`; `items` is it carried onto the current grid.
// A scale change only re-anchors what's shown; the next edit saves it against the new grid.
let { items: saved, extent } = load()
const [items, setItems] = createState<Item[]>(adapt(saved, extent ?? NOMINAL, NOMINAL))
export { items }
let pending = 0

function save() {
  if (pending) GLib.source_remove(pending)
  pending = GLib.timeout_add(GLib.PRIORITY_LOW, SAVE_MS, () => {
    pending = 0
    try {
      GLib.mkdir_with_parents(DIR, 0o755)
      GLib.file_set_contents(FILE, new TextEncoder().encode(serialize(saved, extent ?? undefined)))
    } catch (e) {
      console.error("desktop: save failed", e)
    }
    return GLib.SOURCE_REMOVE
  })
}

function commit(next: Item[]) {
  saved = next
  extent = grid.get()
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
  if (!extent) {
    // first run or an older file: it was arranged on whatever grid this is
    commit(adapt(saved, g, g))
    return
  }
  const next = adapt(saved, extent, g)
  if (next.some((it, i) => it !== items.get()[i])) setItems(next)
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

// settings only: the saved layout keeps its positions and the grid it was arranged on
export function setConfig(id: string, change: Record<string, unknown>) {
  const it = items.get().find((i) => i.id === id)
  if (!it) return
  const config = { ...it.config, ...change }
  const withConfig = (list: Item[]) => list.map((i) => (i.id === id ? { ...i, config } : i))
  saved = withConfig(saved)
  setItems(withConfig(items.get()))
  save()
}

// What each desktop widget kind is: its name, category and sizes. Pure (no GTK), so the
// gallery, the context menu and the saved-layout parser share one tested list.
// The render functions live in registry.ts.

import type { Item, Size } from "./layout.ts"
import { isoDay } from "./dates.ts"

export type Category = "focus" | "time" | "system" | "notes" | "vision"

export type Entry = {
  kind: string
  name: string
  description: string
  category: Category
  sizes: Size[]
  defaultSize: Size
  editable?: boolean // has an "Edit Widget…" form
  defaultConfig?: () => Record<string, unknown>
}

export const CATEGORIES: { id: Category; name: string; glyph: string }[] = [
  { id: "focus", name: "Focus", glyph: "" },
  { id: "time", name: "Time", glyph: "" },
  { id: "system", name: "System", glyph: "" },
  { id: "notes", name: "Notes", glyph: "" },
  { id: "vision", name: "Vision", glyph: "" },
]

export const CATALOG: Entry[] = [
  {
    kind: "fx-today",
    name: "fx Today",
    description: "Your day score, focus time against the target, and streak.",
    category: "focus",
    sizes: ["s", "m", "l"],
    defaultSize: "m",
  },
  {
    kind: "fx-tasks",
    name: "fx Tasks",
    description: "Open tasks by severity, with effort and time spent.",
    category: "focus",
    sizes: ["m", "l"],
    defaultSize: "l",
  },
  {
    kind: "bridge",
    name: "Bridge",
    description: "The next step you left when you stopped, or last night's first question.",
    category: "focus",
    sizes: ["s", "m"],
    defaultSize: "s",
  },
  {
    kind: "clock",
    name: "Clock",
    description: "An analog face, or the time and date.",
    category: "time",
    sizes: ["s", "m"],
    defaultSize: "s",
  },
  {
    kind: "calendar",
    name: "Calendar",
    description: "Today's date, or the whole month.",
    category: "time",
    sizes: ["s", "l"],
    defaultSize: "s",
  },
  {
    kind: "system",
    name: "System",
    description: "CPU, memory, disk and temperature.",
    category: "system",
    sizes: ["s", "m"],
    defaultSize: "m",
  },
  {
    kind: "note",
    name: "Note",
    description: "A sticky note you can type into.",
    category: "notes",
    sizes: ["s", "m", "l"],
    defaultSize: "m",
    defaultConfig: () => ({ text: "" }),
  },
  {
    kind: "goal",
    name: "Goal",
    description: "A picture of where you're headed, with a title and caption.",
    category: "vision",
    sizes: ["s", "m", "l", "xl"],
    defaultSize: "l",
    editable: true,
    defaultConfig: () => ({ image: "", title: "Dream big", caption: "" }),
  },
  {
    kind: "countdown",
    name: "Countdown",
    description: "Days until a date that matters to you.",
    category: "vision",
    sizes: ["s", "m"],
    defaultSize: "s",
    editable: true,
    defaultConfig: () => {
      const now = new Date()
      const later = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30)
      return { title: "Something worth waiting for", date: isoDay(later), created: isoDay(now) }
    },
  },
]

const byKind = new Map(CATALOG.map((e) => [e.kind, e]))
export const entry = (kind: string) => byKind.get(kind)
export const sizesOf = (kind: string) => byKind.get(kind)?.sizes

export function search(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return CATALOG
  return CATALOG.filter((e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q))
}

export const SIZE_NAMES: Record<Size, string> = { s: "Small", m: "Medium", l: "Large", xl: "Extra Large" }

// first run: time across the top-left, today's focus under it, tasks beside
export const DEFAULT_LAYOUT: Item[] = [
  { id: "clock-1", kind: "clock", size: "s", col: 0, row: 0, config: {} },
  { id: "calendar-2", kind: "calendar", size: "s", col: 2, row: 0, config: {} },
  { id: "fx-today-3", kind: "fx-today", size: "m", col: 0, row: 2, config: {} },
  { id: "system-4", kind: "system", size: "m", col: 0, row: 4, config: {} },
  { id: "fx-tasks-5", kind: "fx-tasks", size: "l", col: 4, row: 0, config: {} },
]

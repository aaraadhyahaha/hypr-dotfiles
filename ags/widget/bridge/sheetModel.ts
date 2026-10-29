// Keys of the pause sheet: Tab switches lines, Enter saves (refused while line 1 is only the stem),
// Esc arms the skip and a second Esc closes, keeping anything typed (line 1 beyond the stem, or line 2).
// Pure (no GTK) so it can be unit tested; BridgeSheet.tsx owns the entries, the timer and the flash.

import { written } from "../../service/bridgeModel.ts"

// how long one Esc stays armed
export const ARM_MS = 2000

export type Hint = "idle" | "armed" | "nudge"

export type Sheet = { focus: 1 | 2; hint: Hint }

export type Key = "tab" | "enter" | "esc" | "type" | "timeout"

// what the sheet does next:
// save: keep both lines and close · skip-save: Esc Esc with something typed, keep it and close ·
// close: Esc Esc with nothing written · nudge: refused Enter, flash line 1 · swap: focus the other line
export type Effect = "save" | "skip-save" | "close" | "nudge" | "swap" | null

// what's in the entries when the key arrives
export type Lines = { line: string; pickup: string; stem: string }

export const OPEN: Sheet = { focus: 1, hint: "idle" }

export function step(s: Sheet, key: Key, l: Lines): { sheet: Sheet; effect: Effect } {
  const has = written(l.line, l.stem) !== ""
  switch (key) {
    case "tab":
      return { sheet: { ...s, focus: s.focus === 1 ? 2 : 1 }, effect: "swap" }
    case "enter":
      // the refused Enter brings the caret back to the line that needs finishing
      return has ? { sheet: s, effect: "save" } : { sheet: { focus: 1, hint: "nudge" }, effect: "nudge" }
    case "esc":
      if (s.hint !== "armed") return { sheet: { ...s, hint: "armed" }, effect: null }
      // a pickup line alone is kept too; the note then shows only that
      return { sheet: { ...s, hint: "idle" }, effect: has || l.pickup.trim() ? "skip-save" : "close" }
    case "type":
    case "timeout":
      return { sheet: s.hint === "idle" ? s : { ...s, hint: "idle" }, effect: null }
  }
}

// Keyboard selection model for the overview. Pure (no GTK) so it can be unit tested.

export type Row = "ws" | "win"
export type NavKey = "left" | "right" | "up" | "down" | "tab"

// ws: index into WORKSPACES; win: index into the previewed workspace's windows.
export interface Sel {
  row: Row
  ws: number
  win: number
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n))

// Opening the overview selects the focused workspace, not a window.
export function initialSel(focusedId: number | undefined, wsIds: number[]): Sel {
  return { row: "ws", ws: Math.max(0, wsIds.indexOf(focusedId ?? NaN)), win: 0 }
}

export function step(sel: Sel, key: NavKey, wsCount: number, winCount: number): Sel {
  switch (key) {
    case "up":
      return { ...sel, row: "ws" }
    case "down":
      return winCount > 0 ? { ...sel, row: "win", win: clamp(sel.win, winCount - 1) } : sel
  }

  const d = key === "left" ? -1 : 1
  if (sel.row === "ws") {
    const ws = clamp(sel.ws + d, wsCount - 1)
    // a different workspace previews a different window list, so start at its first window
    return ws === sel.ws ? sel : { ...sel, ws, win: 0 }
  }
  return { ...sel, win: clamp(sel.win + d, winCount - 1) }
}

// Keep the selection valid after the previewed window list changes (e.g. a window closed).
export function reconcile(sel: Sel, winCount: number): Sel {
  if (sel.row === "win" && winCount === 0) return { ...sel, row: "ws", win: 0 }
  const win = clamp(sel.win, winCount - 1)
  return win === sel.win ? sel : { ...sel, win }
}

// Hovering a workspace card previews it — but only once the pointer is armed, i.e. has
// actually moved since the overview opened. Mapping the overlay under a resting pointer
// sends an enter event that must not override the opening selection.
export function hoverSel(sel: Sel, index: number, armed: boolean): Sel {
  if (!armed || (sel.row === "ws" && sel.ws === index)) return sel
  return { row: "ws", ws: index, win: 0 }
}

const MOVE_THRESHOLD = 4

export function pointerMoved(origin: [number, number], x: number, y: number): boolean {
  return Math.hypot(x - origin[0], y - origin[1]) > MOVE_THRESHOLD
}

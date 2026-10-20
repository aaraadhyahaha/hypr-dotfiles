// Workspace slot model for the bar. Pure (no GTK) so it can be unit tested.

export interface Slot {
  id: number
  active: boolean
  occupied: boolean
  urgent: boolean
}

// Always show 1..min, grown to the highest real workspace (or the focused one).
// Special workspaces have negative ids and get their own button instead.
export function slots(
  ws: { id: number; clients: number }[],
  focusedId: number,
  urgent: ReadonlySet<number>,
  min = 5,
): Slot[] {
  const real = ws.filter((w) => w.id > 0)
  const count = Math.max(min, focusedId, ...real.map((w) => w.id))
  const clients = new Map(real.map((w) => [w.id, w.clients]))

  return Array.from({ length: count }, (_, i) => {
    const id = i + 1
    return {
      id,
      active: id === focusedId,
      occupied: (clients.get(id) ?? 0) > 0,
      urgent: urgent.has(id),
    }
  })
}

// Urgency only matters while its workspace still has windows; drops closed, emptied and special ones.
export function pruneUrgent(
  urgent: ReadonlySet<number>,
  ws: { id: number; clients: number }[],
): Set<number> {
  const live = new Set(ws.filter((w) => w.id > 0 && w.clients > 0).map((w) => w.id))
  return new Set([...urgent].filter((id) => live.has(id)))
}

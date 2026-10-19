// Screenshot-cache model for the overview. Pure (no GTK) so it can be unit tested.

// Hyprland normally gives addresses as "0x...", make sure of it.
export const addr = (a: string) => (a.startsWith("0x") ? a : `0x${a}`)

export interface WinInfo {
  address: string
  ws: number
  x: number
  y: number
  w: number
  h: number
  fullscreen: number
  hidden: boolean
  mapped: boolean
}

// `hyprctl clients -j` → WinInfo[] ([] if the output is unusable).
export function parseClients(json: string): WinInfo[] {
  try {
    return JSON.parse(json).map((c: any) => ({
      address: addr(c.address),
      ws: c.workspace.id,
      x: c.at[0],
      y: c.at[1],
      w: c.size[0],
      h: c.size[1],
      fullscreen: c.fullscreen,
      hidden: c.hidden,
      mapped: c.mapped,
    }))
  } catch {
    return []
  }
}

// Windows on `wsId` whose on-screen pixels grim can grab. Tabbed (hidden) or unmapped
// windows have none; with a fullscreen window up, everything else is covered by it.
export function captureTargets(infos: WinInfo[], wsId: number): WinInfo[] {
  const shown = infos.filter((i) => i.ws === wsId && i.mapped && !i.hidden && i.w > 0 && i.h > 0)
  const full = shown.filter((i) => i.fullscreen > 0)
  return full.length > 0 ? full : shown
}

// Fold fresh screenshots into the cache, dropping windows that no longer exist.
// `stale` lists files nothing points to any more, for deletion.
export function mergeShots(
  prev: Record<string, string>,
  fresh: Record<string, string>,
  live: Set<string>,
): { shots: Record<string, string>; stale: string[] } {
  const shots: Record<string, string> = {}
  for (const [a, p] of Object.entries({ ...prev, ...fresh })) if (live.has(a)) shots[a] = p
  const kept = new Set(Object.values(shots))
  const stale = Object.values(prev).filter((p) => !kept.has(p))
  return { shots, stale }
}

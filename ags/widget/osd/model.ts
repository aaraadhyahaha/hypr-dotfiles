// LED change detection for the OSD. Pure (no GTK) so it can be unit tested.

// null = that sysfs file does not exist on this machine
export type Leds = { caps: boolean | null; kbd: number | null; kbdMax: number | null }

export type OsdEvent = { kind: "caps"; on: boolean } | { kind: "kbd"; value: number }

export function ledEvents(prev: Leds, next: Leds): OsdEvent[] {
  const out: OsdEvent[] = []
  if (prev.caps !== null && next.caps !== null && prev.caps !== next.caps)
    out.push({ kind: "caps", on: next.caps })
  if (prev.kbd !== null && next.kbd !== null && prev.kbd !== next.kbd && next.kbdMax)
    out.push({ kind: "kbd", value: next.kbd / next.kbdMax })
  return out
}

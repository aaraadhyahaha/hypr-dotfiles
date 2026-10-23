// Screenshot toolbar helpers. Pure (no GTK) so they can be unit tested.

export const TIMERS = [0, 3, 5, 10]

export const nextTimer = (s: number): number => TIMERS[(TIMERS.indexOf(s) + 1) % TIMERS.length]

export const timerLabel = (s: number): string => (s ? `${s}s` : "Off")

// `hyprctl activewindow -j` → "x,y wxh" for grim / wf-recorder; null without a window
export function windowGeometry(json: string): string | null {
  try {
    const { at, size } = JSON.parse(json)
    if (!Array.isArray(at) || !Array.isArray(size)) return null
    return `${at[0]},${at[1]} ${size[0]}x${size[1]}`
  } catch {
    return null
  }
}

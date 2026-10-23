// Pomodoro popover maths. Pure (no GTK) so it can be unit tested.

export type Phase = "focus" | "short" | "long"

// "Session N of M": the focus session in progress, or during a break the one just done.
// `cycle` counts finished focus sessions; `every` is the long-break interval.
export function sessionOf(phase: Phase, cycle: number, every: number): number {
  const n = Math.max(1, every)
  if (phase === "focus") return (cycle % n) + 1
  if (cycle === 0) return 1
  return ((cycle - 1) % n) + 1
}

// heatmap: 18 weeks × 7 days, 3px gaps
export const HEAT_COLS = 18
export const HEAT_ROWS = 7
export const HEAT_GAP = 3

export const heatCell = (width: number): number =>
  (width - (HEAT_COLS - 1) * HEAT_GAP) / HEAT_COLS

// $primary at 0.06 (no sessions) up to 1.0 (goal met)
export function heatAlpha(sessions: number, goal: number): number {
  if (sessions <= 0) return 0.06
  return 0.25 + 0.75 * Math.min(1, sessions / Math.max(1, goal))
}

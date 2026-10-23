// Battery text for the bar popover and the CC footer. Pure (no GTK) so it can be unit tested.

// 3 h 12 min, 45 min
export function dur(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor(s / 60) % 60
  return h ? `${h} h ${m} min` : `${m} min`
}

export interface BatteryState {
  charging: boolean
  full: boolean
  discharging: boolean
  toEmpty: number
  toFull: number
}

// "3 h 12 min left", "Charging", …; "" when there's nothing to add to the percentage
export function batteryStatus(b: BatteryState): string {
  if (b.charging) return b.toFull > 0 ? `${dur(b.toFull)} to full` : "Charging"
  if (b.full) return "Fully charged"
  // plugged in but holding (charge limit): upower still reports a bogus time to empty
  if (!b.discharging) return "Plugged in"
  return b.toEmpty > 0 ? `${dur(b.toEmpty)} left` : ""
}

// upower's capacity is a percentage; accept a fraction too
export function health(capacity: number, cycles: number): string {
  if (!(capacity > 0)) return ""
  const pct = Math.round(capacity <= 1 ? capacity * 100 : capacity)
  return cycles > 0 ? `Health ${pct}% · ${cycles} cycles` : `Health ${pct}%`
}

// under 0.05 W reads as 0.0: treat it as idle
export const watts = (rate: number): string => (rate >= 0.05 ? `${rate.toFixed(1)} W` : "")

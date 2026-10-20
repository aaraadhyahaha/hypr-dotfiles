// Media player model. Pure (no GTK) so it can be unit tested.

const PLAYING = 0 // AstalMpris.PlaybackStatus.PLAYING

const pad = (n: number) => String(n).padStart(2, "0")

// 3:07, 1:02:03
export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00"
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

// The player the user picked if it is still around, else whichever is playing,
// else the one already shown (`last`, so pausing doesn't swap players), else the first.
export function pickPlayer<P extends { busName: string; playbackStatus: number }>(
  players: P[],
  preferred?: string,
  last?: string,
): P | null {
  return (
    players.find((p) => p.busName === preferred) ??
    players.find((p) => p.playbackStatus === PLAYING) ??
    players.find((p) => p.busName === last) ??
    players[0] ??
    null
  )
}

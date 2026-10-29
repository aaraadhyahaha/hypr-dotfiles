import { createState } from "ags"
import { Gtk } from "ags/gtk4"
import { pomodoro, dayKey } from "../../service/pomodoro"
import { canvas, fill, roundRect, shade, stroke } from "../desktop/widgets/draw"
import Icon from "../common/Icon"
import { HEAT_COLS as WEEKS, HEAT_ROWS, HEAT_GAP as GAP, heatAlpha, heatCell } from "./model"

const [streak, setStreak] = createState(pomodoro.streak)
pomodoro.subscribe(() => setStreak(pomodoro.streak))

export function Streak() {
  return (
    <box
      class={streak.as((n) => (n > 0 ? "pomo-streak lit" : "pomo-streak"))}
      spacing={5}
      valign={Gtk.Align.CENTER}
    >
      <Icon name="local_fire_department" fill class="pomo-streak-icon" />
      <label class="pomo-streak-val" label={streak.as((n) => String(n))} />
      <label class="pomo-streak-unit" label={streak.as((n) => (n === 1 ? "day" : "days"))} />
    </box>
  )
}

// content width of the 332px panel (padding 16, hairline 1); cells stretch to the real width
const WIDTH = 298
const ANIM_MS = 900

const startOfToday = (): Date => {
  const t = new Date()
  return new Date(t.getFullYear(), t.getMonth(), t.getDate())
}

function cellDate(col: number, row: number, today: Date): Date {
  const dow = (today.getDay() + 6) % 7
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  d.setDate(d.getDate() - dow - (WEEKS - 1 - col) * 7 + row)
  return d
}

const easeOut = (x: number): number => 1 - Math.pow(1 - x, 3)

export function Heatmap() {
  let t0 = 0
  let p = 1
  let tick = 0

  const self = canvas(
    "pomo-heat",
    (s, w, _h, c) => {
      const cell = heatCell(w)
      const pitch = cell + GAP
      const goal = Math.max(1, pomodoro.settings.goal)
      const today = startOfToday()
      const todayKey = dayKey(today)

      for (let col = 0; col < WEEKS; col++) {
        const local = Math.min(1, Math.max(0, (p - (col / WEEKS) * 0.5) / 0.5))
        if (local <= 0) continue
        const k = easeOut(local)

        for (let row = 0; row < HEAT_ROWS; row++) {
          const d = cellDate(col, row, today)
          if (d.getTime() > today.getTime()) continue

          const key = dayKey(d)
          const n = pomodoro.days[key]?.sessions ?? 0
          const size = cell * (0.4 + 0.6 * k)
          const x = col * pitch + (cell - size) / 2
          const y = row * pitch + (cell - size) / 2

          fill(s, roundRect(x, y, size, size, 3), shade(c, heatAlpha(n, goal) * k))

          // today: a ring, so the current cell reads even before the first session
          if (key === todayKey) {
            s.append_stroke(roundRect(x + 0.5, y + 0.5, size - 1, size - 1, 2.5), stroke(1), shade(c, 0.6 * k))
          }
        }
      }
    },
    {
      contentWidth: WIDTH,
      contentHeight: Math.round(HEAT_ROWS * heatCell(WIDTH) + (HEAT_ROWS - 1) * GAP),
      hexpand: true,
      vexpand: false,
    },
  )

  // the grow-in runs on the frame clock from each map and lets go of it once settled
  self.connect("map", () => {
    t0 = 0
    p = 0
    if (tick) return
    tick = self.add_tick_callback((_w, clock) => {
      const now = clock.get_frame_time()
      if (t0 === 0) t0 = now
      p = Math.min(1, (now - t0) / (ANIM_MS * 1000))
      self.queue_draw()
      if (p < 1) return true
      tick = 0
      return false
    })
  })

  pomodoro.subscribe(() => self.queue_draw())

  self.set_has_tooltip(true)
  self.connect("query-tooltip", (_w, x, y, _kb, tip) => {
    const cell = heatCell(self.get_width())
    const pitch = cell + GAP
    const col = Math.floor(x / pitch)
    const row = Math.floor(y / pitch)
    if (col < 0 || col >= WEEKS || row < 0 || row >= HEAT_ROWS) return false
    if (x - col * pitch > cell || y - row * pitch > cell) return false

    const today = startOfToday()
    const d = cellDate(col, row, today)
    if (d.getTime() > today.getTime()) return false

    const n = pomodoro.days[dayKey(d)]?.sessions ?? 0
    const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    tip.set_text(`${date} · ${n} ${n === 1 ? "session" : "sessions"}`)
    return true
  })

  return self
}
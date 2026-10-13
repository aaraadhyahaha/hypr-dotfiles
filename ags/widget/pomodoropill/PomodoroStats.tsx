import { createState } from "ags"
import { Gtk } from "ags/gtk4"
import cairo from "cairo"
import type CairoGi from "gi://cairo"
import { pomodoro, dayKey } from "../../service/pomodoro"

const [streak, setStreak] = createState(pomodoro.streak)
pomodoro.subscribe(() => setStreak(pomodoro.streak))

export function Streak() {
  return (
    <box
      class={streak.as((n) => (n > 0 ? "pomo-streak lit" : "pomo-streak"))}
      spacing={5}
      valign={Gtk.Align.CENTER}
    >
      <label class="pomo-streak-icon" label={"\uf06d"} />
      <label class="pomo-streak-val" label={streak.as((n) => String(n))} />
      <label class="pomo-streak-unit" label={streak.as((n) => (n === 1 ? "day" : "days"))} />
    </box>
  )
}

const WEEKS = 15
const CELL = 13
const GAP = 3
const PITCH = CELL + GAP
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

function roundRect(cr: cairo.Context, x: number, y: number, w: number, h: number, r: number): void {
  cr.newPath()
  cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0)
  cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2)
  cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI)
  cr.arc(x + r, y + r, r, Math.PI, (3 * Math.PI) / 2)
  cr.closePath()
}

export function Heatmap() {
  return (
    <Gtk.DrawingArea
      class="pomo-heat"
      contentWidth={WEEKS * PITCH - GAP}
      contentHeight={7 * PITCH - GAP}
      halign={Gtk.Align.CENTER}
      $={(self: Gtk.DrawingArea) => {
        let t0 = 0
        let p = 1

        self.set_draw_func((area, ctx: CairoGi.Context, _w, _h) => {
          const cr = ctx as unknown as cairo.Context
          const c = area.get_color()
          const goal = Math.max(1, pomodoro.settings.goal)
          const today = startOfToday()
          const todayKey = dayKey(today)

          for (let col = 0; col < WEEKS; col++) {
            const local = Math.min(1, Math.max(0, (p - (col / WEEKS) * 0.5) / 0.5))
            if (local <= 0) continue
            const k = easeOut(local)

            for (let row = 0; row < 7; row++) {
              const d = cellDate(col, row, today)
              if (d.getTime() > today.getTime()) continue

              const key = dayKey(d)
              const n = pomodoro.days[key]?.sessions ?? 0
              const size = CELL * (0.4 + 0.6 * k)
              const x = col * PITCH + (CELL - size) / 2
              const y = row * PITCH + (CELL - size) / 2
              const alpha = (n === 0 ? 0.1 : 0.3 + 0.7 * Math.min(1, n / goal)) * k

              roundRect(cr, x, y, size, size, 3.5)
              cr.setSourceRGBA(c.red, c.green, c.blue, alpha)
              cr.fill()

              if (key === todayKey) {
                roundRect(cr, x, y, size, size, 3.5)
                cr.setLineWidth(1.2)
                cr.setSourceRGBA(c.red, c.green, c.blue, 0.9 * k)
                cr.stroke()
              }
            }
          }
        })

        self.connect("map", () => {
          t0 = 0
          p = 0
        })
        self.add_tick_callback((_w, clock) => {
          if (p < 1) {
            const now = clock.get_frame_time()
            if (t0 === 0) t0 = now
            p = Math.min(1, (now - t0) / (ANIM_MS * 1000))
            self.queue_draw()
          }
          return true
        })

        pomodoro.subscribe(() => self.queue_draw())

        self.set_has_tooltip(true)
        self.connect("query-tooltip", (_w, x, y, _kb, tip) => {
          const col = Math.floor(x / PITCH)
          const row = Math.floor(y / PITCH)
          if (col < 0 || col >= WEEKS || row < 0 || row >= 7) return false
          if (x - col * PITCH > CELL || y - row * PITCH > CELL) return false

          const today = startOfToday()
          const d = cellDate(col, row, today)
          if (d.getTime() > today.getTime()) return false

          const n = pomodoro.days[dayKey(d)]?.sessions ?? 0
          const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          tip.set_text(`${date} · ${n} ${n === 1 ? "session" : "sessions"}`)
          return true
        })
      }}
    />
  )
}
import { Gtk } from "ags/gtk4"
import { Accessor, createState } from "ags"

export default function Stat({ label, source, format, active }: {
  label: string
  source: Accessor<number>
  format: (v: number) => string
  active: Accessor<boolean>
}) {
  const HISTORY = 40
  const history: number[] = new Array(HISTORY).fill(0)
  const [text, setText] = createState("--")

  return (
    <box class="qs-stat" orientation={Gtk.Orientation.VERTICAL} hexpand>
      <box>
        <label class="qs-stat-name" xalign={0} hexpand label={label} />
        <label class="qs-stat-val" label={text} />
      </box>
      <Gtk.DrawingArea
        class="qs-graph"
        hexpand
        heightRequest={44}
        $={(self) => {
          self.set_draw_func((_area: Gtk.DrawingArea, cr: any, w: number, h: number) => {
            const c = self.get_color()
            const step = w / (HISTORY - 1)
            const ys = history.map((v) => h - 1 - v * (h - 3))

            const trace = () => {
              cr.moveTo(0, ys[0])
              for (let i = 1; i < ys.length; i++) {
                const x0 = (i - 1) * step
                const x1 = i * step
                const mx = (x0 + x1) / 2
                cr.curveTo(mx, ys[i - 1], mx, ys[i], x1, ys[i])
              }
            }

            trace()
            cr.lineTo(w, h)
            cr.lineTo(0, h)
            cr.closePath()
            cr.setSourceRGBA(c.red, c.green, c.blue, 0.15)
            cr.fill()

            trace()
            cr.setLineWidth(1.6)
            cr.setSourceRGBA(c.red, c.green, c.blue, 0.9)
            cr.stroke()
          })

          const push = () => {
            const v = Math.min(1, Math.max(0, source.get()))
            history.push(v)
            history.shift()
            setText(format(v))
            self.queue_draw()
          }

          let unsub: (() => void) | null = null
          const sync = () => {
            if (active.get()) {
              if (!unsub) {
                push()
                unsub = source.subscribe(push)
              }
            } else if (unsub) {
              unsub()
              unsub = null
            }
          }
          active.subscribe(sync)
          sync()
        }}
      />
    </box>
  )
}

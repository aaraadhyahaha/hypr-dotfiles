import { Gtk } from "ags/gtk4"
import { Accessor, createState } from "ags"
import Gsk from "gi://Gsk"
import { canvas, fill, shade, stroke } from "../../desktop/widgets/draw"

export default function Stat({ label, source, format, active }: {
  label: string
  source: Accessor<number>
  format: (v: number) => string
  active: Accessor<boolean>
}) {
  const HISTORY = 40
  const history: number[] = new Array(HISTORY).fill(0)
  const [text, setText] = createState("--")

  // the history as a smooth filled trace, painted as GPU paths
  function Graph() {
    const self = canvas("qs-graph", (s, w, h, c) => {
      const step = w / (HISTORY - 1)
      const ys = history.map((v) => h - 1 - v * (h - 3))

      const trace = (b: Gsk.PathBuilder) => {
        b.move_to(0, ys[0])
        for (let i = 1; i < ys.length; i++) {
          const x0 = (i - 1) * step
          const x1 = i * step
          const mx = (x0 + x1) / 2
          b.cubic_to(mx, ys[i - 1], mx, ys[i], x1, ys[i])
        }
      }

      const area = Gsk.PathBuilder.new()
      trace(area)
      area.line_to(w, h)
      area.line_to(0, h)
      area.close()
      fill(s, area.to_path(), shade(c, 0.15))

      const line = Gsk.PathBuilder.new()
      trace(line)
      s.append_stroke(line.to_path(), stroke(1.6), shade(c, 0.9))
    }, { hexpand: true, vexpand: false, heightRequest: 44 })

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
    return self
  }

  return (
    <box class="qs-stat" orientation={Gtk.Orientation.VERTICAL} hexpand>
      <box>
        <label class="qs-stat-name" xalign={0} hexpand label={label} />
        <label class="qs-stat-val" label={text} />
      </box>
      <Graph />
    </box>
  )
}

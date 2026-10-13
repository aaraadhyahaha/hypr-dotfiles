import { createState } from "ags"
import { Gtk } from "ags/gtk4"
import cairo from "cairo"
import type CairoGi from "gi://cairo"
import { pomodoro, type PomodoroState, type Settings } from "../../service/pomodoro"
import { Heatmap, Streak } from "./PomodoroStats"

const [state, setState] = createState<PomodoroState>({ ...pomodoro.state })
pomodoro.subscribe(() => setState({ ...pomodoro.state }))

const fmt = (sec: number): string => {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

const PHASE_NAME = { focus: "Focus", short: "Short break", long: "Long break" } as const

const ICON = { play: "\uf04b", pause: "\uf04c", skip: "\uf051", reset: "\uf0e2" }

const ring =
  (lineWidth: number) =>
    (area: Gtk.DrawingArea, ctx: CairoGi.Context, w: number, h: number): void => {
      const cr = ctx as unknown as cairo.Context
      const frac = pomodoro.fraction
      const c = area.get_color()
      const r = Math.min(w, h) / 2 - lineWidth
      const cx = w / 2
      const cy = h / 2
      const start = -Math.PI / 2

      cr.setLineWidth(lineWidth)
      cr.setSourceRGBA(c.red, c.green, c.blue, 0.2)
      cr.arc(cx, cy, r, 0, 2 * Math.PI)
      cr.stroke()

      if (frac > 0) {
        cr.setLineCap(cairo.LineCap.ROUND)
        cr.setSourceRGBA(c.red, c.green, c.blue, c.alpha)
        cr.arc(cx, cy, r, start, start + 2 * Math.PI * frac)
        cr.stroke()
      }
    }

function Ring({ size, line, tick }: { size: number; line: number; tick: boolean }) {
  return (
    <Gtk.DrawingArea
      contentWidth={size}
      contentHeight={size}
      halign={Gtk.Align.CENTER}
      valign={Gtk.Align.CENTER}
      $={(self: Gtk.DrawingArea) => {
        self.set_draw_func(ring(line))
        state.subscribe(() => self.queue_draw())
        if (tick) {
          self.add_tick_callback(() => {
            self.queue_draw()
            return true
          })
        }
      }}
    />
  )
}

function Stepper({
  label,
  field,
  min,
  max,
}: {
  label: string
  field: keyof Settings
  min: number
  max: number
}) {
  const value = state.as(() => pomodoro.settings[field])
  const step = (d: number) => {
    const next = Math.min(max, Math.max(min, pomodoro.settings[field] + d))
    pomodoro.setSettings({ [field]: next } as Partial<Settings>)
  }
  return (
    <box class="pomo-step" hexpand spacing={4}>
      <label class="pomo-step-label" label={label} xalign={0} hexpand />
      <button class="pomo-step-btn" label="−" onClicked={() => step(-1)} />
      <label class="pomo-step-val" label={value.as((v) => String(v))} widthChars={2} />
      <button class="pomo-step-btn" label="+" onClicked={() => step(1)} />
    </box>
  )
}

export default function PomodoroPill() {
  const [open, setOpen] = createState(false)

  return (
    <menubutton
      class={state.as(
        (s) =>
          `pomo ${s.phase} ${s.running ? "running" : "paused"} ${!s.running && s.remaining === s.total ? "idle" : ""
          }`,
      )}
      tooltipText={state.as((s) => `${PHASE_NAME[s.phase]}${s.task ? " · " + s.task : ""}`)}
      $={(self: Gtk.MenuButton) => {
        const g = new Gtk.GestureClick({ button: 3 })
        g.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        g.connect("pressed", () => pomodoro.toggle())
        self.add_controller(g)
      }}
    >
      <box spacing={6}>
        <Ring size={16} line={2.5} tick={false} />
        <label class="pomo-time" label={state.as((s) => fmt(s.remaining))} />
      </box>

      <popover
        class="qs-pop"
        hasArrow={false}
        $={(self) => self.connect("notify::visible", () => setOpen(self.visible))}
      >
        <revealer
          transitionType={Gtk.RevealerTransitionType.SLIDE_DOWN}
          transitionDuration={300}
          revealChild={open}
        >
          <box
            class={state.as((s) => `qs pomo-card ${s.phase}`)}
            orientation={Gtk.Orientation.VERTICAL}
            spacing={12}
          >
            <label
              class="pomo-phase"
              xalign={0}
              label={state.as((s) => PHASE_NAME[s.phase])}
            />

            <overlay halign={Gtk.Align.CENTER}>
              <Ring size={150} line={7} tick={true} />
              <label
                $type="overlay"
                class="pomo-big"
                halign={Gtk.Align.CENTER}
                valign={Gtk.Align.CENTER}
                label={state.as((s) => fmt(s.remaining))}
              />
            </overlay>

            <box class="pomo-controls" halign={Gtk.Align.CENTER} spacing={10}>
              <button
                class="pomo-ctl"
                label={ICON.reset}
                tooltipText="Reset"
                onClicked={() => pomodoro.reset()}
              />
              <button
                class="pomo-ctl main"
                label={state.as((s) => (s.running ? ICON.pause : ICON.play))}
                onClicked={() => pomodoro.toggle()}
              />
              <button
                class="pomo-ctl"
                label={ICON.skip}
                tooltipText="Skip"
                onClicked={() => pomodoro.skip()}
              />
            </box>

            <Gtk.Entry
              class="pomo-task"
              placeholderText="What are you focusing on?"
              $={(self: Gtk.Entry) => {
                self.set_text(pomodoro.state.task)
                self.connect("changed", () => pomodoro.setTask(self.get_text()))
              }}
            />

            <box orientation={Gtk.Orientation.VERTICAL} spacing={6}>
              <box>
                <label
                  class="pomo-goal-label"
                  xalign={0}
                  hexpand
                  label={state.as(
                    () => `Today · ${pomodoro.today.sessions} / ${pomodoro.settings.goal} sessions`,
                  )}
                />
                <Streak />
              </box>
              <Gtk.ProgressBar
                class="pomo-goal"
                fraction={state.as(() =>
                  Math.min(1, pomodoro.today.sessions / Math.max(1, pomodoro.settings.goal)),
                )}
              />
              <Heatmap />
            </box>

            <box spacing={12}>
              <Stepper label="Focus" field="focus" min={1} max={120} />
              <Stepper label="Short" field="short" min={1} max={60} />
            </box>
            <box spacing={12}>
              <Stepper label="Long" field="long" min={1} max={60} />
              <Stepper label="Goal" field="goal" min={1} max={24} />
            </box>
          </box>
        </revealer>
      </popover>
    </menubutton>
  )
}
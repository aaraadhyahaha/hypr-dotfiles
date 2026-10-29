import { createState } from "ags"
import { Gtk } from "ags/gtk4"
import { Motion, ENTER, onShow } from "../common/motion"
import Gsk from "gi://Gsk"
import { arcPath, canvas, shade, stroke, type Paint } from "../desktop/widgets/draw"
import { pomodoro, type PomodoroState, type Settings } from "../../service/pomodoro"
import { Heatmap, Streak } from "./PomodoroStats"
import Icon from "../common/Icon"
import { sessionOf } from "./model"

const [state, setState] = createState<PomodoroState>({ ...pomodoro.state })
pomodoro.subscribe(() => setState({ ...pomodoro.state }))

const fmt = (sec: number): string => {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

const PHASE_NAME = { focus: "Focus", short: "Short break", long: "Long break" } as const

const ring =
  (lineWidth: number): Paint =>
    (s, w, h, c): void => {
      const frac = pomodoro.fraction
      const r = Math.min(w, h) / 2 - lineWidth
      const cx = w / 2
      const cy = h / 2
      const start = -Math.PI / 2

      s.append_stroke(arcPath(cx, cy, r, 0, 2 * Math.PI), stroke(lineWidth), shade(c, 0.2))

      if (frac > 0) {
        s.append_stroke(arcPath(cx, cy, r, start, start + 2 * Math.PI * frac), stroke(lineWidth, Gsk.LineCap.ROUND), shade(c, c.alpha))
      }
    }

function Ring({ size, line, tick }: { size: number; line: number; tick: boolean }) {
  const self = canvas("", ring(line), {
    widthRequest: size,
    heightRequest: size,
    hexpand: false,
    vexpand: false,
    halign: Gtk.Align.CENTER,
    valign: Gtk.Align.CENTER,
  })
  state.subscribe(() => self.queue_draw())
  if (tick) {
    self.add_tick_callback(() => {
      self.queue_draw()
      return true
    })
  }
  return self
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
      <button class="pomo-step-btn" onClicked={() => step(-1)}>
        <Icon name="remove" />
      </button>
      <label class="pomo-step-val" label={value.as((v) => String(v))} />
      <button class="pomo-step-btn" onClicked={() => step(1)}>
        <Icon name="add" />
      </button>
    </box>
  )
}

export default function PomodoroPill() {
  let motion: Motion

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
        $={(self) => onShow(self, motion, ENTER.popover)}
      >
        <Motion origin="top" $={(self) => (motion = self)}>
          <box
            class={state.as((s) => `pomo-card ${s.phase}`)}
            orientation={Gtk.Orientation.VERTICAL}
            spacing={12}
          >
            <box>
              <label
                class="pomo-phase"
                xalign={0}
                hexpand
                label={state.as((s) => PHASE_NAME[s.phase])}
              />
              <label
                class="pomo-session"
                label={state.as(
                  (s) =>
                    `Session ${sessionOf(s.phase, s.cycle, pomodoro.settings.longEvery)} of ${pomodoro.settings.longEvery}`,
                )}
              />
            </box>

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
                valign={Gtk.Align.CENTER}
                tooltipText="Reset"
                onClicked={() => pomodoro.reset()}>
                <Icon name="replay" />
              </button>
              <button class="pomo-ctl main" onClicked={() => pomodoro.toggle()}>
                <Icon name={state.as((s) => (s.running ? "pause" : "play_arrow"))} fill />
              </button>
              <button
                class="pomo-ctl"
                valign={Gtk.Align.CENTER}
                tooltipText="Skip"
                onClicked={() => pomodoro.skip()}>
                <Icon name="skip_next" fill />
              </button>
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

            <box orientation={Gtk.Orientation.VERTICAL} spacing={8}>
              <box spacing={12} homogeneous>
                <Stepper label="Focus" field="focus" min={1} max={120} />
                <Stepper label="Short" field="short" min={1} max={60} />
              </box>
              <box spacing={12} homogeneous>
                <Stepper label="Long" field="long" min={1} max={60} />
                <Stepper label="Goal" field="goal" min={1} max={24} />
              </box>
            </box>
          </box>
        </Motion>
      </popover>
    </menubutton>
  )
}
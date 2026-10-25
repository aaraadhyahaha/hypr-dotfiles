import { type FxQuery, FX_ADD_DEFAULTS, fxAddArgs, matchTasks } from "./actionsModel"
import { type Item } from "./model"
import { fxStatus, fxProblem, fxRun, openFx } from "../../service/fx"
import { type FxStatus, type FxTask, hm, sinceMinutes } from "../../service/fxModel"
import { pomodoro } from "../../service/pomodoro"

// Launcher fx mode (`!` or `fx `): today's score and the open tasks from `fx status --json`,
// with rows that shell out to fx's own verbs. svc.fx's FileMonitor picks up the change, so
// the desktop fx widgets refresh by themselves.

const EXAMPLE = "! add Read ch 4 /3 45m"

function streakText(s: FxStatus) {
  const { days, status } = s.streak
  if (!days) return "No streak yet"
  return `${days}-day streak${status === "bent" ? " (bent)" : ""}`
}

// `listed`: the task in focus has its own row below, so the title isn't repeated
function activeText(s: FxStatus, listed: boolean) {
  const a = s.active
  if (!a) return "No focus session"
  if (listed) return `In focus ${sinceMinutes(a.since)}m`
  return `In focus: ${a.title ?? "no task"} · ${sinceMinutes(a.since)}m`
}

const headerItem = (s: FxStatus, listed: boolean): Item => ({
  name: `Score ${s.score} · focus ${hm(s.focusMin)} of ${hm(s.targetMin)}`,
  description: `${streakText(s)} · ${activeText(s, listed)}`,
  symbol: "target",
  level: s.targetMin > 0 ? Math.min(1, s.focusMin / s.targetMin) : undefined,
  hint: "Open fx",
  launch: openFx,
})

// Alt+Enter: the fx session and a pomodoro run together; never toggles focus off
async function focusWithPomodoro(t: FxTask, on: boolean) {
  if (!on && (await fxRun("focus", String(t.id))) === null) return
  pomodoro.startFocus(undefined, t.title)
}

function taskItem(s: FxStatus, t: FxTask): Item {
  const on = s.active?.taskId === t.id
  const spent = Math.round(t.minutes)
  return {
    name: t.title,
    description: [
      `Severity ${t.severity}`,
      spent ? `${spent} of ${t.effort}m` : `${t.effort}m planned`,
      on && `in focus ${sinceMinutes(s.active!.since)}m`,
    ].filter(Boolean).join(" · "),
    symbol: on ? "timer" : "radio_button_unchecked",
    hint: on ? "Stop" : "Focus",
    launch: () => fxRun("focus", String(t.id)),
    altHint: "Done",
    alt: () => fxRun("done", String(t.id)),
    extraHint: "Pomodoro",
    extra: () => focusWithPomodoro(t, on),
  }
}

function stopItem(s: FxStatus): Item {
  if (!s.active) return { name: "No focus session running", description: "Pick a task to start one", symbol: "timer_off" }
  return {
    name: "Stop focus",
    description: `${s.active.title ?? "No task"} · ${sinceMinutes(s.active.since)}m`,
    symbol: "stop_circle",
    hint: "Stop",
    launch: () => fxRun("stop"),
  }
}

function addItem(title: string, severity?: number, effort?: number): Item {
  if (!title) {
    return { name: "Name the task", description: `${EXAMPLE} · /N severity, 45m effort`, symbol: "add_task" }
  }
  const args = fxAddArgs({ title, severity, effort })
  return {
    name: `Add “${title}”`,
    description: `Severity ${severity ?? FX_ADD_DEFAULTS.severity} · ${effort ?? FX_ADD_DEFAULTS.effort}m planned`,
    symbol: "add_task",
    hint: "Add",
    launch: () => fxRun(...args),
    altHint: "Add + focus",
    alt: async () => {
      const out = await fxRun(...args, "--json")
      const id = out === null ? undefined : JSON.parse(out).id
      if (Number.isInteger(id)) await fxRun("focus", String(id))
    },
  }
}

// null status with no problem: the first `fx status` hasn't answered yet
function problemItem(): Item | null {
  const p = fxProblem.get()
  if (p === "missing") return { name: "fx isn't installed", description: "Install it to ~/.local/bin/fx", symbol: "error" }
  if (p === "error") return { name: "Couldn't read fx", description: "Run “fx status” in a terminal to see why", symbol: "error" }
  if (!fxStatus.get()) return { name: "Loading fx…", symbol: "hourglass_empty" }
  return null
}

export function fxItems(q: FxQuery): Item[] {
  if (q.kind === "open") return [{ name: "Open fx", description: "Focus tracker", symbol: "open_in_new", hint: "Open", launch: openFx }]
  if (q.kind === "add") return [addItem(q.title, q.severity, q.effort)]
  const bad = problemItem()
  if (bad) return [bad]
  const s = fxStatus.get()!
  if (q.kind === "stop") return [stopItem(s)]

  const tasks = matchTasks(s.tasks, q.filter, s.active?.taskId ?? null).map((t) => taskItem(s, t))
  // a filter that matches nothing offers to add it as a task
  if (q.filter) return tasks.length ? tasks : [addItem(q.filter)]
  // a session with no listed task (none, or a finished one) still needs a way to stop
  const listed = s.active?.taskId != null && s.tasks.some((t) => t.id === s.active!.taskId && !t.done)
  const rows = [headerItem(s, listed),...(s.active && !listed ? [stopItem(s)] : [])]
  if (!tasks.length) return [...rows, { name: "All clear", description: `Add one with “${EXAMPLE}”`, symbol: "task_alt" }]
  return [...rows, ...tasks]
}

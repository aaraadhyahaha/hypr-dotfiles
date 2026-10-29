import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createRoot } from "ags"
import GLib from "gi://GLib"
import Pango from "gi://Pango"
import AstalHyprland from "gi://AstalHyprland"
import { MOTION } from "../common/motion"
import { type Prompt, closePrompt, prompt, saveBridge } from "../../service/bridge"
import { STEM } from "../../service/bridgeModel"
import { type Effect, type Hint, type Key, type Sheet as State, ARM_MS, OPEN, step } from "./sheetModel"

// The pause sheet (svc.bridge): full screen and quiet, it asks for two lines when a task stops
// (or the day ends): line 1 starts on a stem ("Next, I "), line 2 is an optional half-finished
// sentence. The keys go through sheetModel's `step`; this file owns the widgets, the Esc timer
// and the nudge flash. No motion of its own: Hyprland fades the layer in and out. No idle timeout.
// Keyboard: EXCLUSIVE while open. When a window or another shell surface opens, it lets go of the
// keyboard (the bounce Desktop.tsx uses) so that one gets focus.

const SETTLE_MS = 80
// line 1's 24px mono is ~32px tall; 4px more makes its 36px line (half above, half below)
const LINE1_GAP = 4

const COPY = {
  task: { gutter: "next" },
  day: { gutter: "first" },
}

// [text, is a key name]: key names are set in mono
const HINTS: Record<Hint, [string, boolean][]> = {
  idle: [["tab", true], [" other line   ·   ", false], ["↵", true], [" save   ·   ", false], ["esc esc", true], [" skip", false]],
  armed: [["esc", true], [" again to skip   ·   what you've written is kept", false]],
  nudge: [["finish the line first   ·   ", false], ["esc esc", true], [" to skip", false]],
}

type Sheet = {
  win: Astal.Window
  before: Gtk.Label // "Stopped after " or the whole day line
  time: Gtk.Label
  after: Gtk.Label
  row1: Gtk.Box
  gutter1: Gtk.Label
  line1: Gtk.TextView
  row2: Gtk.Box
  line2: Gtk.Entry
  hints: Record<Hint, Gtk.Box>
}

let sheet: Sheet | null = null
let current: Prompt | null = null
let state: State = OPEN
let armed = 0
let flash = 0

const stop = (id: number) => id && GLib.source_remove(id)

let settle = 0
// EXCLUSIVE (or NONE) now, ON_DEMAND shortly after, while the sheet is still open
function settleKeymode(win: Astal.Window, now: Astal.Keymode) {
  stop(settle)
  win.keymode = now
  settle = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SETTLE_MS, () => {
    settle = 0
    if (current) win.keymode = Astal.Keymode.ON_DEMAND
    return GLib.SOURCE_REMOVE
  })
}

// another surface is opening: hand it the keyboard, stay clickable
function release() {
  if (!current || !sheet) return
  sheet.win.set_focus(null)
  settleKeymode(sheet.win, Astal.Keymode.NONE)
}

// line 1 is one line: a pasted newline counts as a space
function line1Text(v: Gtk.TextView) {
  const buf = v.buffer
  return buf.get_text(buf.get_start_iter(), buf.get_end_iter(), false).replace(/\s*\n\s*/g, " ")
}

function focusLine(n: 1 | 2) {
  if (!sheet) return
  if (n === 2) return sheet.line2.grab_focus()
  sheet.line1.grab_focus()
  const buf = sheet.line1.buffer
  buf.place_cursor(buf.get_end_iter())
}

function render() {
  if (!sheet) return
  const focused = (w: Gtk.Widget, on: boolean) => (on ? w.add_css_class("focused") : w.remove_css_class("focused"))
  focused(sheet.row1, state.focus === 1)
  focused(sheet.row2, state.focus === 2)
  for (const h of Object.keys(HINTS) as Hint[]) sheet.hints[h].visible = h === state.hint
}

function playFlash() {
  if (!sheet) return
  const row = sheet.row1
  stop(flash)
  row.add_css_class("flash")
  // the class on fades in over $dur-fast; taking it off fades out over $dur-enter
  flash = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MOTION.fast, () => {
    flash = 0
    row.remove_css_class("flash")
    return GLib.SOURCE_REMOVE
  })
}

function run(effect: Effect) {
  if (!current || !sheet) return
  switch (effect) {
    case "save":
    case "skip-save":
      saveBridge(current, line1Text(sheet.line1), sheet.line2.text)
      closePrompt()
      break
    case "close":
      closePrompt()
      break
    case "nudge":
      focusLine(1)
      playFlash()
      break
    case "swap":
      focusLine(state.focus)
      break
  }
}

function press(key: Key) {
  if (!current || !sheet) return
  const next = step(state, key, { line: line1Text(sheet.line1), pickup: sheet.line2.text, stem: STEM[current.kind] })
  const wasArmed = state.hint === "armed"
  state = next.sheet
  if (state.hint === "armed" && !wasArmed) {
    stop(armed)
    armed = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ARM_MS, () => {
      armed = 0
      press("timeout")
      return GLib.SOURCE_REMOVE
    })
  } else if (state.hint !== "armed") {
    stop(armed)
    armed = 0
  }
  render()
  run(next.effect)
}

// a key that edits text; modifiers alone don't count as typing
const types = (keyval: number) =>
  Gdk.keyval_to_unicode(keyval) !== 0 || keyval === Gdk.KEY_BackSpace || keyval === Gdk.KEY_Delete

function onKey(keyval: number) {
  switch (keyval) {
    case Gdk.KEY_Tab:
    case Gdk.KEY_ISO_Left_Tab:
      press("tab")
      return true
    case Gdk.KEY_Return:
    case Gdk.KEY_KP_Enter:
      press("enter")
      return true
    case Gdk.KEY_Escape:
      press("esc")
      return true
  }
  if (types(keyval)) press("type")
  return false
}

// a click into a line moves the focus there too
function follow(w: Gtk.Widget, n: 1 | 2) {
  const focus = new Gtk.EventControllerFocus()
  focus.connect("enter", () => {
    if (state.focus === n) return
    state = { ...state, focus: n }
    render()
  })
  w.add_controller(focus)
}

function build(): Sheet {
  let win!: Astal.Window
  let before!: Gtk.Label
  let time!: Gtk.Label
  let after!: Gtk.Label
  let row1!: Gtk.Box
  let gutter1!: Gtk.Label
  let line1!: Gtk.TextView
  let row2!: Gtk.Box
  let line2!: Gtk.Entry
  const hints = {} as Record<Hint, Gtk.Box>
  const W = Astal.WindowAnchor
  createRoot(() => (
    <window
      $={(self) => {
        win = self as Astal.Window
        const key = new Gtk.EventControllerKey()
        key.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        key.connect("key-pressed", (_, keyval) => onKey(keyval))
        win.add_controller(key)
        AstalHyprland.get_default().connect("client-added", release)
        for (const w of app.get_windows())
          if (w !== win && w instanceof Astal.Window)
            // only surfaces that want the keyboard; a toast or the OSD mustn't steal typing
            w.connect("notify::visible", () => w.visible && w.keymode !== Astal.Keymode.NONE && release())
      }}
      name="bridge"
      namespace="bridge"
      class="Bridge"
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.NONE}
      exclusivity={Astal.Exclusivity.IGNORE}
      anchor={W.TOP | W.BOTTOM | W.LEFT | W.RIGHT}
      application={app}
      visible={false}
    >
      <box orientation={Gtk.Orientation.VERTICAL}>
        <box class="bridge-block" orientation={Gtk.Orientation.VERTICAL} vexpand valign={Gtk.Align.START}>
          <box class="bridge-row bridge-context">
            <box class="bridge-gutter" />
            <box valign={Gtk.Align.BASELINE_FILL}>
              <label $={(self) => (before = self as Gtk.Label)} valign={Gtk.Align.BASELINE_FILL} />
              <label $={(self) => (time = self as Gtk.Label)} class="bridge-time" valign={Gtk.Align.BASELINE_FILL} />
              <label
                $={(self) => (after = self as Gtk.Label)}
                valign={Gtk.Align.BASELINE_FILL}
                ellipsize={Pango.EllipsizeMode.END}
                maxWidthChars={1}
                hexpand
                xalign={0}
              />
            </box>
          </box>
          <box $={(self) => (row1 = self as Gtk.Box)} class="bridge-row bridge-row1">
            <label $={(self) => (gutter1 = self as Gtk.Label)} class="bridge-gutter" xalign={1} valign={Gtk.Align.START} />
            <Gtk.TextView
              $={(self) => {
                line1 = self
                follow(self, 1)
              }}
              class="bridge-line1"
              wrapMode={Gtk.WrapMode.WORD_CHAR}
              acceptsTab={false}
              // CSS line-height only reaches a text view on a restyle: the 36px line is set here
              topMargin={LINE1_GAP / 2}
              bottomMargin={LINE1_GAP / 2}
              pixelsInsideWrap={LINE1_GAP}
              widthRequest={1000}
              halign={Gtk.Align.START}
            />
          </box>
          <box $={(self) => (row2 = self as Gtk.Box)} class="bridge-row bridge-row2">
            <label class="bridge-gutter" label="pick up" xalign={1} valign={Gtk.Align.BASELINE_FILL} />
            <entry
              $={(self) => {
                line2 = self as Gtk.Entry
                follow(self, 2)
              }}
              class="bridge-line2"
              placeholderText="half a sentence, if you have one"
              widthRequest={1000}
              halign={Gtk.Align.START}
              valign={Gtk.Align.BASELINE_FILL}
            />
          </box>
        </box>
        <box class="bridge-hint">
          {(Object.keys(HINTS) as Hint[]).map((h) => (
            <box $={(self) => (hints[h] = self as Gtk.Box)} class={`hint-${h}`} visible={h === "idle"}>
              {HINTS[h].map(([text, mono]) => (
                <label class={mono ? "bridge-key" : ""} label={text} valign={Gtk.Align.BASELINE_FILL} />
              ))}
            </box>
          ))}
        </box>
      </box>
    </window>
  ))
  return { win, before, time, after, row1, gutter1, line1, row2, line2, hints }
}

const pad = (n: number) => String(n).padStart(2, "0")

// the monitor Hyprland has focused, as GDK knows it
function focusedMonitor() {
  const name = AstalHyprland.get_default().focusedMonitor?.name
  return app.get_monitors().find((m) => m.get_connector() === name) ?? null
}

function open(p: Prompt) {
  sheet ??= build()
  const { win, before, time, after, gutter1, line1, line2 } = sheet
  current = p
  state = OPEN
  stop(armed)
  armed = 0
  if (p.kind === "task") {
    // the fx status only has whole minutes
    before.label = "Stopped after "
    time.label = `${pad(p.stoppedMin)}:00`
    after.label = ` · ${p.title || "this task"}`
  } else {
    before.label = `End of day · ${p.day} · on the desktop tomorrow morning`
    time.label = after.label = ""
  }
  time.visible = after.visible = p.kind === "task"
  gutter1.label = COPY[p.kind].gutter
  line1.buffer.set_text(STEM[p.kind], -1)
  line2.set_text("")
  render()
  const mon = focusedMonitor()
  if (mon && !win.visible) win.gdkmonitor = mon
  stop(settle)
  settle = 0
  win.keymode = Astal.Keymode.EXCLUSIVE
  win.visible = true
  focusLine(1)
}

function close() {
  current = null
  stop(armed)
  stop(flash)
  armed = flash = 0
  if (!sheet) return
  sheet.row1.remove_css_class("flash")
  sheet.win.visible = false // instant; Hyprland fades the last frame
  sheet.win.keymode = Astal.Keymode.NONE
}

let started = false

// called once from app.ts; costs one subscription until the first prompt
export default function BridgeSheet() {
  if (started) return
  started = true
  prompt.subscribe(() => {
    const p = prompt.get()
    p ? open(p) : close()
  })
}

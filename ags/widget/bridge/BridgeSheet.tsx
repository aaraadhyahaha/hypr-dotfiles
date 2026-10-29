import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { createRoot } from "ags"
import GLib from "gi://GLib"
import Pango from "gi://Pango"
import AstalHyprland from "gi://AstalHyprland"
import { Motion, ENTER } from "../common/motion"
import Icon from "../common/Icon"
import { type Prompt, closePrompt, prompt, saveBridge } from "../../service/bridge"

// The bridge sheet (svc.bridge): rises from the bottom edge when a task stops (or the day ends)
// and asks for one line. Follows the `prompt` state: built the first time a prompt opens, reused
// after. Enter or Save keeps the line; Esc, Skip or an empty line drops it. Untouched, it closes
// after IDLE_S.
// Keyboard: it opens EXCLUSIVE so typing lands in the field at once, then settles to ON_DEMAND
// (a click elsewhere takes the keyboard back). When a window or another shell surface opens, it
// lets go of the keyboard for a moment so that one gets focus (the bounce Desktop.tsx uses).

const IDLE_S = 90
const SETTLE_MS = 80

const COPY = {
  task: {
    eyebrow: (t: string) => `Stopped · ${t || "this task"}`,
    question: "What's the very next thing you'd do?",
    sub: "It'll be waiting when you come back to this task.",
    placeholder: "Open the notes and redo Q4…",
  },
  day: {
    eyebrow: () => "End of day",
    question: "Tomorrow's first question?",
    sub: "It'll be on your desktop in the morning.",
    placeholder: "What will you ask yourself first?",
  },
}

type Sheet = { win: Astal.Window; motion: Motion; eyebrow: Gtk.Label; question: Gtk.Label; sub: Gtk.Label; entry: Gtk.Entry }

let sheet: Sheet | null = null
let current: Prompt | null = null
let idle = 0

const stopIdle = () => {
  if (idle) GLib.source_remove(idle)
  idle = 0
}

let settle = 0
// EXCLUSIVE (or NONE) now, ON_DEMAND shortly after, while the sheet is still open
function settleKeymode(win: Astal.Window, now: Astal.Keymode) {
  if (settle) GLib.source_remove(settle)
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

const submit = () => {
  if (current && sheet) saveBridge(current, sheet.entry.text)
  closePrompt()
}

function build(): Sheet {
  let win!: Astal.Window
  let motion!: Motion
  let eyebrow!: Gtk.Label
  let question!: Gtk.Label
  let sub!: Gtk.Label
  let entry!: Gtk.Entry
  createRoot(() => (
    <window
      $={(self) => {
        win = self as Astal.Window
        const key = new Gtk.EventControllerKey()
        key.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        key.connect("key-pressed", (_, keyval) => {
          if (keyval !== Gdk.KEY_Escape) return false
          closePrompt()
          return true
        })
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
      anchor={Astal.WindowAnchor.BOTTOM}
      application={app}
      visible={false}
    >
      <Motion $={(self) => (motion = self)}>
        <box class="sheet" orientation={Gtk.Orientation.VERTICAL}>
          <box class="bridge-eyebrow" spacing={6}>
            <Icon name="flag" fill />
            <label
              $={(self) => (eyebrow = self as Gtk.Label)}
              xalign={0}
              hexpand
              ellipsize={Pango.EllipsizeMode.END}
              maxWidthChars={1}
            />
          </box>
          <label $={(self) => (question = self as Gtk.Label)} class="bridge-question" xalign={0} wrap />
          <label $={(self) => (sub = self as Gtk.Label)} class="bridge-sub" xalign={0} />
          <entry
            $={(self) => (entry = self as Gtk.Entry)}
            class="bridge-entry"
            hexpand
            onNotifyText={stopIdle}
            onActivate={submit}
          />
          <box class="bridge-actions" spacing={8}>
            <label class="bridge-hint" label="Esc to skip · ↵ to save" xalign={0} hexpand />
            <button class="bridge-skip" onClicked={closePrompt} label="Skip" />
            <button class="bridge-save" onClicked={submit} label="Save" />
          </box>
        </box>
      </Motion>
    </window>
  ))
  return { win, motion, eyebrow, question, sub, entry }
}

function open(p: Prompt) {
  sheet ??= build()
  const { win, motion, eyebrow, question, sub, entry } = sheet
  current = p
  const copy = COPY[p.kind]
  eyebrow.label = copy.eyebrow(p.title)
  question.label = copy.question
  sub.label = copy.sub
  entry.placeholderText = copy.placeholder
  entry.set_text("")
  stopIdle()
  idle = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, IDLE_S, () => {
    idle = 0
    closePrompt()
    return GLib.SOURCE_REMOVE
  })
  settleKeymode(win, Astal.Keymode.EXCLUSIVE)
  motion.animate(ENTER.rise)
  win.visible = true
  entry.grab_focus()
}

function close() {
  stopIdle()
  current = null
  if (!sheet) return
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

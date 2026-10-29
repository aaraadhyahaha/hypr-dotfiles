import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { createRoot } from "ags"
import Pango from "gi://Pango"
import { Motion, ENTER } from "../common/motion"
import { bridges, markSeen, resumeBridge } from "../../service/bridge"
import { type Bridge, dayOf, morningNote } from "../../service/bridgeModel"

// The bridge note (bridge.note): a paper sticky note pinned to the desktop's top-right corner,
// under app windows, just below the bar (NORMAL exclusivity keeps it out of the bar's zone). Shows
// last night's question, else the newest unseen task bridge; hidden when there's neither. A click
// marks it seen (it goes; Hyprland fades the layer) and resumes it: `fx focus <id>`, then fx's
// terminal is raised or started. Reacts only to `bridges`: no timers, so a day note waits for the
// next change to the notes to count as morning.

const pick = (list: Bridge[]) =>
  morningNote(list, dayOf(new Date())) ?? list.find((b) => b.kind === "task" && !b.seen) ?? null

let started = false

// called once from app.ts, after Desktop() so it stacks above the desktop layer
export default function BridgeNote() {
  if (started) return
  started = true
  let win!: Astal.Window
  let motion!: Motion
  let eyebrow!: Gtk.Label
  let text!: Gtk.Label
  let shown: Bridge | null = null

  const { TOP, RIGHT } = Astal.WindowAnchor
  createRoot(() => (
    <window
      $={(self) => {
        win = self as Astal.Window
        const click = new Gtk.GestureClick()
        click.connect("released", () => {
          if (!shown) return
          const b = shown
          markSeen(b)
          resumeBridge(b)
        })
        win.add_controller(click)
      }}
      name="bridgenote"
      namespace="bridgenote"
      class="BridgeNote"
      layer={Astal.Layer.BOTTOM}
      keymode={Astal.Keymode.NONE}
      exclusivity={Astal.Exclusivity.NORMAL}
      anchor={TOP | RIGHT}
      application={app}
      visible={false}
    >
      <Motion $={(self) => (motion = self)} origin="top">
        <box class="note" orientation={Gtk.Orientation.VERTICAL}>
          <label
            $={(self) => (eyebrow = self as Gtk.Label)}
            class="note-eyebrow"
            xalign={0}
            ellipsize={Pango.EllipsizeMode.END}
            maxWidthChars={1}
          />
          <label
            $={(self) => (text = self as Gtk.Label)}
            class="note-text"
            xalign={0}
            yalign={0}
            wrap
            wrapMode={Pango.WrapMode.WORD_CHAR}
            maxWidthChars={1}
          />
        </box>
      </Motion>
    </window>
  ))

  const render = () => {
    const b = pick(bridges.get())
    if (b === shown) return
    const was = shown
    shown = b
    if (!b) {
      win.visible = false // instant; Hyprland fades the last frame
      return
    }
    eyebrow.label = b.kind === "day" ? "Tomorrow's first question" : b.title || "Next step"
    text.label = b.text
    if (!was) motion.animate(ENTER.card)
    win.visible = true
  }

  bridges.subscribe(render)
  render()
}

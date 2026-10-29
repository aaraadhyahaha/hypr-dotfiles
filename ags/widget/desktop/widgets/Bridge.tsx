import { Gtk } from "ags/gtk4"
import { onCleanup } from "ags"
import Pango from "gi://Pango"
import { bridges, markSeen, resumeBridge } from "../../../service/bridge"
import { type Bridge as Note, dayOf, morningNote } from "../../../service/bridgeModel"
import { fxStatus } from "../../../service/fx"
import { EmptyState, box, label } from "./common"
import { Streak } from "./FxToday"
import type { WidgetProps } from "./types"

// A sticky note with last night's question (or, failing that, the newest task bridge). Clicking it
// goes back into the work: `fx focus <id>`, or fx's launcher mode for a day note. No ticker: it
// redraws when the notes change or fx refreshes (once a minute at least, so the day rolls over).

// the note worth showing now
function pick(list: Note[]): Note | null {
  return morningNote(list, dayOf(new Date())) ?? list.find((b) => b.kind === "task") ?? null
}

export default function Bridge(p: WidgetProps) {
  const body = box("dw-bridge-body", true, 6, [], { hexpand: true, vexpand: true })
  let shown: Note | null = null

  const render = () => {
    const b = pick(bridges.get())
    if (b === shown && body.get_first_child()) return
    shown = b
    let c
    while ((c = body.get_first_child())) body.remove(c)
    if (!b) {
      body.append(EmptyState("\u{f03eb}", "No bridge yet", p.size === "s" ? "" : "Stop a task to leave a bridge"))
      return
    }
    if (p.size !== "s") {
      const head = b.kind === "day" ? "FIRST QUESTION" : b.title.toUpperCase() || "NEXT STEP"
      body.append(label(head, "dw-eyebrow dw-bridge-head", { ellipsize: Pango.EllipsizeMode.END }))
    }
    body.append(
      label(b.text, "dw-bridge-text", {
        wrap: true,
        wrapMode: Pango.WrapMode.WORD_CHAR,
        ellipsize: Pango.EllipsizeMode.END,
        lines: p.size === "s" ? 4 : 3,
        valign: Gtk.Align.START,
        vexpand: true,
      }),
    )
    if (p.size !== "s") body.append(Streak())
  }

  onCleanup(bridges.subscribe(render))
  // the morning note depends on the day; fx's refresh is the only clock this needs
  onCleanup(fxStatus.subscribe(render))
  render()

  if (!p.preview)
    p.onActivate(() => {
      if (!shown) return
      const b = shown
      markSeen(b)
      resumeBridge(b)
    })
  return body
}

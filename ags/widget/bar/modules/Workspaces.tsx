import { Gtk } from "ags/gtk4"
import { createBinding, createState, For } from "ags"
import { execAsync } from "ags/process"
import { MOTION } from "../../common/motion"
import AstalHyprland from "gi://AstalHyprland"
import { slots, type Slot } from "./wsSlots"

const dispatch = (lua: string) => execAsync(["hyprctl", "dispatch", lua]).catch(console.error)

export default function Workspaces() {
  const hypr = AstalHyprland.get_default()
  const [urgent, setUrgent] = createState<ReadonlySet<number>>(new Set())
  const [state, setState] = createState<Slot[]>([])
  const [special, setSpecial] = createState(false)

  const refresh = () => {
    const ws = hypr.workspaces.map((w) => ({ id: w.id, clients: w.clients.length }))
    const focused = hypr.focusedWorkspace?.id ?? 1
    if (urgent.get().has(focused)) {
      const next = new Set(urgent.get())
      next.delete(focused)
      setUrgent(next)
    }
    setState(slots(ws, focused, urgent.get()))
    setSpecial(ws.some((w) => w.id < 0 && w.clients > 0))
  }

  for (const sig of ["notify::workspaces", "notify::clients", "notify::focused-workspace", "client-moved"])
    hypr.connect(sig, refresh)
  hypr.connect("urgent", (_, client: AstalHyprland.Client) => {
    const id = client.workspace?.id
    if (!id || id === hypr.focusedWorkspace?.id) return
    setUrgent(new Set([...urgent.get(), id]))
    refresh()
  })
  refresh()

  // ids keep their identity across refreshes, so <For> reuses buttons and the pip transition plays
  const ids = state.as((s) => s.map((x) => x.id))
  const cls = (id: number) =>
    state.as((s) => {
      const x = s.find((y) => y.id === id)
      return ["ws-btn", x?.active && "active", x?.occupied && "occupied", x?.urgent && "urgent"]
        .filter(Boolean)
        .join(" ")
    })

  let lastScroll = 0

  return (
    <box class="workspaces">
      <Gtk.EventControllerScroll
        flags={Gtk.EventControllerScrollFlags.VERTICAL}
        onScroll={(_, _dx, dy) => {
          const now = Date.now()
          if (dy === 0 || now - lastScroll < MOTION.fast) return
          lastScroll = now
          dispatch(`hl.dsp.focus({ workspace = "${dy > 0 ? "e+1" : "e-1"}" })`)
        }}
      />
      <For each={ids}>
        {(id) => (
          <button class={cls(id)} onClicked={() => dispatch(`hl.dsp.focus({ workspace = ${id} })`)}>
            <box class="pip" valign={Gtk.Align.CENTER} halign={Gtk.Align.CENTER} />
          </button>
        )}
      </For>
      <button
        class="ws-btn"
        visible={special}
        tooltipText="Scratchpad"
        onClicked={() => dispatch(`hl.dsp.workspace.toggle_special("magic")`)}
      >
        <box class="pip special" valign={Gtk.Align.CENTER} halign={Gtk.Align.CENTER} />
      </button>
    </box>
  )
}

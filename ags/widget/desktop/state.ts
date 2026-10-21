import AstalHyprland from "gi://AstalHyprland"
import { createComputed, createState } from "ags"

// Edit mode (gallery open, remove badges, desktop lifted above windows) and whether the
// desktop can be seen at all. Ticking widgets (clock hand, sparklines) pause while it can't.

export const [editing, setEditing] = createState(false)

const hypr = AstalHyprland.get_default()
const [uncovered, setUncovered] = createState(true)

// tiled or fullscreen windows hide the desktop; floating ones leave most of it showing
function refresh() {
  const ws = hypr.focusedWorkspace
  setUncovered(!ws || ws.clients.every((c) => c.floating && !c.fullscreen))
}
for (const sig of ["notify::focused-workspace", "notify::clients", "client-moved"]) hypr.connect(sig, refresh)
hypr.connect("event", (_h, name: string) => {
  if (name === "changefloatingmode" || name === "fullscreen") refresh()
})
refresh()

export const live = createComputed(() => editing() || uncovered())

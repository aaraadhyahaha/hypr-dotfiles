import { Gtk } from "ags/gtk4"
import { createBinding } from "ags"
import { execAsync } from "ags/process"
import AstalHyprland from "gi://AstalHyprland"

export default function Workspaces() {
  const hypr = AstalHyprland.get_default()
  const focused = createBinding(hypr, "focusedWorkspace")

  return (
    <box class="workspaces">
      {[1, 2, 3, 4, 5].map((id) => (
        <button
          class={focused.as((fw) => (fw.id === id ? "ws-btn active" : "ws-btn"))}
          onClicked={() => execAsync(["hyprctl", "dispatch", `hl.dsp.focus({ workspace = ${id} })`])}
        >
          <box class="pip" valign={Gtk.Align.CENTER} halign={Gtk.Align.CENTER} />
        </button>
      ))}
    </box>
  )
}

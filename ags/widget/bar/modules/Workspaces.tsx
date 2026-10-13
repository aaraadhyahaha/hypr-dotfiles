import { Gtk } from "ags/gtk4"
import { createBinding } from "ags"
import { execAsync } from "ags/process"
import AstalHyprland from "gi://AstalHyprland"

export default function Workspaces() {
  const hypr = AstalHyprland.get_default()
  const focused = createBinding(hypr, "focusedWorkspace")

  return (
    <box class="workspaces" valign={Gtk.Align.CENTER}>
      {[1, 2, 3, 4, 5].map((id) => (
        <button
          valign={Gtk.Align.CENTER}
          class={focused.as((fw) => (fw.id === id ? "dot active" : "dot"))}
          onClicked={() => execAsync(["hyprctl", "dispatch", `hl.dsp.focus({ workspace = ${id} })`])}
        />
      ))}
    </box>
  )
}

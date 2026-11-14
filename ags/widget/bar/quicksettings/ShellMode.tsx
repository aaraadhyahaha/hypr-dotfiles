import { Gtk } from "ags/gtk4"
import { shellMode, setShellMode } from "../../../service/mood"
import type { Mode } from "../../../service/moodModel"
import Icon from "../../common/Icon"

// Ambient · Both · Reactive (DESIGN.md › Mood); same segment as ThemeMode
function Segment({ mode, icon, label }: { mode: Mode; icon: string; label: string }) {
  const on = shellMode.as((m) => m === mode)
  return (
    <button class={on.as((o) => (o ? "cc-seg on" : "cc-seg"))} onClicked={() => setShellMode(mode)}>
      <box halign={Gtk.Align.CENTER} spacing={8}>
        <Icon name={icon} fill />
        <label label={label} />
      </box>
    </button>
  )
}

export default function ShellMode() {
  return (
    <box class="cc-card cc-mode" homogeneous>
      <Segment mode="ambient" icon="routine" label="Ambient" />
      <Segment mode="both" icon="layers" label="Both" />
      <Segment mode="reactive" icon="bolt" label="Reactive" />
    </box>
  )
}

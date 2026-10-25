import { Gtk } from "ags/gtk4"
import { themeMode, setTheme } from "./theme"
import Icon from "../../common/Icon"

function Segment({ mode, icon, label }: { mode: "dark" | "light"; icon: string; label: string }) {
  // anything but "light" counts as dark, as theme-apply.sh does
  const on = themeMode.as((m) => (m === "light") === (mode === "light"))
  return (
    <button class={on.as((o) => (o ? "cc-seg on" : "cc-seg"))} onClicked={() => setTheme(mode)}>
      <box halign={Gtk.Align.CENTER} spacing={8}>
        <Icon name={icon} fill />
        <label label={label} />
      </box>
    </button>
  )
}

export default function ThemeMode() {
  return (
    <box class="cc-card cc-mode" homogeneous>
      <Segment mode="dark" icon="dark_mode" label="Dark" />
      <Segment mode="light" icon="light_mode" label="Light" />
    </box>
  )
}

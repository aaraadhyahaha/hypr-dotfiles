import { Gtk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { themeMode, setThemeMode } from "./theme"

export default function ThemeMode() {
  const choose = (m: string) => {
    setThemeMode(m)
    execAsync([
      "sh", "-c",
      `echo ${m} > ~/.cache/theme_mode && ~/.config/hypr/scripts/theme-apply.sh`,
    ])
  }

  return (
    <box class="qs-mode" homogeneous>
      <button
        class={themeMode.as((m) => (m === "light" ? "qs-seg" : "qs-seg on"))}
        onClicked={() => choose("dark")}
      >
        <box halign={Gtk.Align.CENTER}>
          <label class="glyph" label={"\uf186"} />
          <label label="Dark" />
        </box>
      </button>
      <button
        class={themeMode.as((m) => (m === "light" ? "qs-seg on" : "qs-seg"))}
        onClicked={() => choose("light")}
      >
        <box halign={Gtk.Align.CENTER}>
          <label class="glyph" label={"\uf185"} />
          <label label="Light" />
        </box>
      </button>
    </box>
  )
}

import { Gtk } from "ags/gtk4"
import { Accessor } from "ags"

// 40×22 pill switch, shared by the Control Center panels
export default function Switch({ on, onToggle }: { on: Accessor<boolean>; onToggle: () => void }) {
  return (
    <button
      class={on.as((o) => (o ? "switch on" : "switch"))}
      valign={Gtk.Align.CENTER}
      onClicked={onToggle}
    >
      <box class="knob" halign={on.as((o) => (o ? Gtk.Align.END : Gtk.Align.START))} />
    </button>
  )
}

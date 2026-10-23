import { type Accessor } from "ags"
import { Gtk } from "ags/gtk4"

// Material Symbols Rounded, drawn from the font by ligature: `name` is the symbol's
// name ("wifi", "battery_5_bar"). `fill` switches to the solid variant.
export default function Icon({
  name,
  fill = false,
  class: cls = "",
  halign,
}: {
  name: string | Accessor<string>
  fill?: boolean
  class?: string
  halign?: Gtk.Align
}) {
  return <label class={`icon${fill ? " fill" : ""} ${cls}`.trim()} halign={halign} label={name} />
}

import { Gtk } from "ags/gtk4"
import { Accessor } from "ags"

export default function Slider({ icon, value, onChange }: {
  icon: string | Accessor<string>
  value: Accessor<number>
  onChange: (v: number) => void
}) {
  return (
    <box class="qs-slider">
      <image iconName={icon} />
      <Gtk.Scale
        hexpand
        drawValue={false}
        $={(self) => {
          self.set_range(0, 1)
          self.set_value(value.get())
          value.subscribe(() => {
            if (Math.abs(self.get_value() - value.get()) > 0.005) self.set_value(value.get())
          })
          self.connect("value-changed", () => {
            if (Math.abs(self.get_value() - value.get()) > 0.005) onChange(self.get_value())
          })
        }}
      />
    </box>
  )
}

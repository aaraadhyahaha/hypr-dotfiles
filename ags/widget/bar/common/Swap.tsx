import { Gtk } from "ags/gtk4"
import { Accessor } from "ags"

export default function Swap({ text, chars = 4 }: { text: Accessor<string>; chars?: number }) {
  return (
    <stack
      transitionType={Gtk.StackTransitionType.CROSSFADE}
      transitionDuration={180}
      $={(self) => {
        let flip = false
        const a = new Gtk.Label({ label: text.get(), widthChars: chars, xalign: 1 })
        const b = new Gtk.Label({ widthChars: chars, xalign: 1 })
        self.add_named(a, "a")
        self.add_named(b, "b")
        text.subscribe(() => {
          flip = !flip
            ; (flip ? b : a).label = text.get()
          self.visibleChildName = flip ? "b" : "a"
        })
      }}
    />
  )
}

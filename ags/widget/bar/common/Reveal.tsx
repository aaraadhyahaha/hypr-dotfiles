import { Gtk } from "ags/gtk4"
import { Accessor } from "ags"

export default function Reveal({ show, children }: { show: Accessor<boolean>; children?: any }) {
  return (
    <revealer
      transitionType={Gtk.RevealerTransitionType.SLIDE_RIGHT}
      transitionDuration={250}
      revealChild={show}
    >
      {children}
    </revealer>
  )
}

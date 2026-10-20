import { Gtk } from "ags/gtk4"
import { Accessor } from "ags"
import { MOTION } from "../../common/motion"

export default function Reveal({ show, children }: { show: Accessor<boolean>; children?: any }) {
  return (
    <revealer
      transitionType={Gtk.RevealerTransitionType.SLIDE_RIGHT}
      transitionDuration={MOTION.base}
      revealChild={show}
    >
      {children}
    </revealer>
  )
}

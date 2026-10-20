import { Gtk } from "ags/gtk4"
import { Accessor } from "ags"
import { Motion, ENTER, LEAVE, MOTION } from "../../common/motion"

// bar items that grow sideways: the slot widens while the content drifts in and fades,
// so text never appears clipped mid-word
export default function Reveal({ show, children }: { show: Accessor<boolean>; children?: any }) {
  let motion: Motion
  return (
    <revealer
      transitionType={Gtk.RevealerTransitionType.SLIDE_RIGHT}
      transitionDuration={MOTION.base + 60}
      revealChild={show}
      $={(self) =>
        self.connect("notify::reveal-child", () =>
          motion.animate(self.revealChild ? ENTER.side : LEAVE.content),
        )
      }
    >
      <Motion $={(self) => (motion = self)}>{children}</Motion>
    </revealer>
  )
}

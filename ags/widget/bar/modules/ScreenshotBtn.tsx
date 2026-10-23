import { Gtk } from "ags/gtk4"
import Icon from "../../common/Icon"
import { Motion, ENTER, onShow } from "../../common/motion"
import Toolbar from "../../screenshot/Toolbar"

// Opens the screenshot / record toolbar
export default function ScreenshotBtn() {
  let motion: Motion
  let pop: Gtk.Popover

  return (
    <menubutton class="shot-btn" tooltipText="Screenshot">
      <Icon name="screenshot_region" class="lg" />
      <popover
        class="qs-pop"
        hasArrow={false}
        $={(self: Gtk.Popover) => {
          pop = self
          onShow(self, motion, ENTER.popover)
        }}
      >
        <Motion origin="top" $={(self) => (motion = self)}>
          <Toolbar close={() => pop.popdown()} />
        </Motion>
      </popover>
    </menubutton>
  )
}

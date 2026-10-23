import { Gtk } from "ags/gtk4"
import { cpu, ramGb } from "../../../service/system"
import Icon from "../../common/Icon"
import { Motion, ENTER, onShow } from "../../common/motion"
import SysPanel, { start, stop } from "./SysPanel"

// CPU and RAM readout; opens the System stats popover
export default function SysMini() {
  let motion: Motion

  return (
    <menubutton class="sysmini">
      <box spacing={10}>
        <box spacing={6}>
          <Icon name="memory" />
          <label widthChars={3} xalign={1} label={cpu.as((v) => `${Math.round(v * 100)}%`)} />
        </box>
        <box spacing={6}>
          <Icon name="memory_alt" />
          <label label={ramGb} />
        </box>
      </box>
      <popover
        class="qs-pop"
        hasArrow={false}
        $={(self: Gtk.Popover) => {
          onShow(self, motion, ENTER.popover)
          self.connect("show", start)
          self.connect("hide", stop)
        }}
      >
        <Motion origin="top" $={(self) => (motion = self)}>
          <SysPanel />
        </Motion>
      </popover>
    </menubutton>
  )
}

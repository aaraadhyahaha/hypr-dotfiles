import { cpu, ramGb } from "../../../service/system"
import Icon from "../../common/Icon"

// CPU and RAM readout; the System stats popover (phase 5) will hang off this.
export default function SysMini() {
  return (
    <box class="sysmini" spacing={10}>
      <box spacing={6}>
        <Icon name="memory" />
        <label widthChars={3} xalign={1} label={cpu.as((v) => `${Math.round(v * 100)}%`)} />
      </box>
      <box spacing={6}>
        <Icon name="memory_alt" />
        <label label={ramGb} />
      </box>
    </box>
  )
}

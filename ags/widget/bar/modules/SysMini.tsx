import { cpu, ramGb } from "../../../service/system"

// CPU and RAM readout; the System stats popover (phase 5) will hang off this.
export default function SysMini() {
  return (
    <box class="sysmini" spacing={10}>
      <box spacing={4}>
        <label class="glyph" label={""} />
        <label widthChars={4} xalign={1} label={cpu.as((v) => `${Math.round(v * 100)}%`)} />
      </box>
      <box spacing={4}>
        <label class="glyph" label={""} />
        <label label={ramGb} />
      </box>
    </box>
  )
}

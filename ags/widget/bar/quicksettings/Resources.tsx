import { Gtk } from "ags/gtk4"
import { Accessor } from "ags"
import { cpu, ram, disk, temp } from "../../../service/system"
import Stat from "./Stat"

const pct = (v: number) => `${Math.round(v * 100)}%`
const deg = (v: number) => `${Math.round(v * 100)}°C`

export default function Resources({ active }: { active: Accessor<boolean> }) {
  return (
    <box class="qs-stats" orientation={Gtk.Orientation.VERTICAL}>
      <box homogeneous>
        <Stat label="CPU" source={cpu} format={pct} active={active} />
        <Stat label="RAM" source={ram} format={pct} active={active} />
      </box>
      <box homogeneous>
        <Stat label="Disk" source={disk} format={pct} active={active} />
        <Stat label="Temp" source={temp} format={deg} active={active} />
      </box>
    </box>
  )
}

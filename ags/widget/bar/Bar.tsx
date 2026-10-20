import app from "ags/gtk4/app"
import { Astal, Gdk } from "ags/gtk4"
import { toggleLauncher } from "../launcher/Launcher"
import PomodoroPill from "../pomodoropill/PomodoroPill"
import Sep from "./common/Sep"
import Workspaces from "./modules/Workspaces"
import WindowTitle from "./modules/WindowTitle"
import DateMenu from "./modules/DateMenu"
import Tray from "./modules/Tray"
import Battery from "./modules/Battery"
import Caffeine from "./modules/Caffeine"
import Power from "./modules/Power"
import QuickSettings from "./quicksettings/QuickSettings"

export default function Bar(gdkmonitor: Gdk.Monitor) {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

  return (
    <window
      visible
      name="bar"
      namespace="bar"
      class="Bar"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT}
      application={app}
    >
      <centerbox class="body">
        <box $type="start">
          <button class="edge" onClicked={() => toggleLauncher()}>
            <label class="glyph" label={"\uf303"} />
          </button>
          <Sep />
          <Workspaces />
          <WindowTitle />
        </box>
        <box $type="center">
          <DateMenu />
        </box>
        <box $type="end" class="end">
          <Tray />
          <Battery />
          <Sep />
          <PomodoroPill />
          <QuickSettings />
          <Sep />
          <Caffeine />
          <Power />
        </box>
      </centerbox>
    </window>
  )
}

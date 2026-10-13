import app from "ags/gtk4/app"
import { Astal, Gdk } from "ags/gtk4"
import { toggleLauncher } from "../launcher/Launcher"
import PomodoroPill from "../pomodoropill/PomodoroPill"
import Sep from "./common/Sep"
import Workspaces from "./modules/Workspaces"
import WindowTitle from "./modules/WindowTitle"
import Clock from "./modules/Clock"
import Notifications from "./modules/Notifications"
import Tray from "./modules/Tray"
import Wifi from "./modules/Wifi"
import Bluetooth from "./modules/Bluetooth"
import Battery from "./modules/Battery"
import Volume from "./modules/Volume"
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
          <Clock />
          <Sep />
          <Notifications />
        </box>
        <box $type="end" class="end">
          <Tray />
          <Sep />
          <Wifi />
          <Bluetooth />
          <Sep />
          <Battery />
          <Sep />
          <Volume />
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

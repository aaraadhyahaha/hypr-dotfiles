import app from "ags/gtk4/app"
import { Astal, Gdk } from "ags/gtk4"
import { toggleLauncher } from "./Launcher"
import PomodoroPill from "./PomodoroPill"
import Sep from "./bar/common/Sep"
import Workspaces from "./bar/modules/Workspaces"
import WindowTitle from "./bar/modules/WindowTitle"
import Clock from "./bar/modules/Clock"
import Notifications from "./bar/modules/Notifications"
import Tray from "./bar/modules/Tray"
import Wifi from "./bar/modules/Wifi"
import Bluetooth from "./bar/modules/Bluetooth"
import Battery from "./bar/modules/Battery"
import Volume from "./bar/modules/Volume"
import Caffeine from "./bar/modules/Caffeine"
import Power from "./bar/modules/Power"
import QuickSettings from "./bar/quicksettings/QuickSettings"

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

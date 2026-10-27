import app from "ags/gtk4/app"
import { Astal, Gdk } from "ags/gtk4"
import { toggleLauncher } from "../launcher/Launcher"
import PomodoroPill from "../pomodoropill/PomodoroPill"
import Sep from "./common/Sep"
import Workspaces from "./modules/Workspaces"
import WindowTitle from "./modules/WindowTitle"
import DateMenu from "./modules/DateMenu"
import Media from "../media/Media"
import Tray from "./modules/Tray"
import Battery from "./modules/Battery"
import Caffeine from "./modules/Caffeine"
import Power from "./modules/Power"
import Privacy from "./modules/Privacy"
import Recording from "./modules/Recording"
import SysMini from "./modules/SysMini"
import ScreenshotBtn from "./modules/ScreenshotBtn"
import QuickSettings from "./quicksettings/QuickSettings"
import { editing } from "../desktop/state"
import Icon from "../common/Icon"

export default function Bar(gdkmonitor: Gdk.Monitor) {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

  return (
    <window
      visible
      name="bar"
      namespace="bar"
      class={editing.as((on) => (on ? "Bar editing" : "Bar"))}
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT}
      application={app}
    >
      <centerbox class="body">
        <box $type="start" spacing={2}>
          <button class="edge" onClicked={() => toggleLauncher()}>
            <Icon name="apps" fill class="lg" />
          </button>
          <Sep />
          <Workspaces />
          <WindowTitle />
        </box>
        <box $type="center" spacing={4}>
          <DateMenu />
          <Media />
        </box>
        <box $type="end" class="end" spacing={2}>
          <Privacy />
          <Recording />
          <SysMini />
          <ScreenshotBtn />
          <Battery />
          <Sep />
          <PomodoroPill />
          <QuickSettings />
          <Sep />
          <Tray />
          <Caffeine />
          <Power />
        </box>
      </centerbox>
    </window>
  )
}

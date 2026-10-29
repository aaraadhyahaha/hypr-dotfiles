import app from "ags/gtk4/app"
import style from "./style.scss"
import Bar from "./widget/bar/Bar"
import Toasts from "./widget/toasts/Toasts"
import Launcher, { toggleLauncher } from "./widget/launcher/Launcher"
import Osd, { showBrightness } from "./widget/osd/Osd"
import Wallpapers, { toggleWallpapers } from "./widget/wallpapers/Wallpapers"
import Files, { toggleFiles } from "./widget/files/Files"
import Screenshot, { ShotPreview, screenshotRegion, screenshotFull } from "./widget/screenshot/Screenshot"
import ShotMenu, { toggleShotMenu } from "./widget/screenshot/ShotMenu"
import Clipboard, { toggleClipboard } from "./widget/clipboard/Clipboard"
import Overview, { toggleOverview } from "./widget/overview/Overview"
import { toggleDateMenu } from "./widget/bar/modules/DateMenu"
import { toggleCC } from "./widget/bar/quicksettings/cc"
import Desktop, { toggleEditWidgets } from "./widget/desktop/Desktop"
import { restoreTimers } from "./service/timer"
import BridgeSheet from "./widget/bridge/BridgeSheet"
import { startBridge, leaveBridge, bridgeBack } from "./service/bridge"

app.start({
  css: style,
  requestHandler(argv, response) {
    if (argv[0] === "toggle-launcher") {
      toggleLauncher(argv[1])
      return response("ok")
    }
    if (argv[0] === "osd-brightness") {
      showBrightness()
      return response("ok")
    }
    if (argv[0] === "toggle-wallpapers") {
      toggleWallpapers()
      return response("ok")
    }
    if (argv[0] === "toggle-files") {
      toggleFiles()
      return response("ok")
    }
    if (argv[0] === "screenshot") { screenshotRegion(); return response("ok") }
    if (argv[0] === "screenshot-full") { screenshotFull(); return response("ok") }
    if (argv[0] === "toggle-shotmenu") { toggleShotMenu(); return response("ok") }
    if (argv[0] === "toggle-clipboard") { toggleClipboard(); return response("ok") }
    if (argv[0] === "toggle-overview") { toggleOverview(); return response("ok") }
    if (argv[0] === "toggle-datemenu") { toggleDateMenu(); return response("ok") }
    if (argv[0] === "toggle-cc") { toggleCC(); return response("ok") }
    if (argv[0] === "toggle-widgets") { toggleEditWidgets(); return response("ok") }
    if (argv[0] === "bridge") { leaveBridge("day"); return response("ok") }
    if (argv[0] === "bridge-back") { bridgeBack(); return response("ok") }
    response("unknown request")
  },
  main() {
    restoreTimers()
    Desktop()
    app.get_monitors().map(Bar)
    Toasts()
    Launcher()
    Osd()
    Wallpapers()
    Files()
    Screenshot()
    ShotPreview()
    ShotMenu()
    Clipboard()
    Overview()
    BridgeSheet()
    startBridge()
  },
})

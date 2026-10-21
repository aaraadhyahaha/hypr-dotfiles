import app from "ags/gtk4/app"
import style from "./style.scss"
import Bar from "./widget/bar/Bar"
import Toasts from "./widget/toasts/Toasts"
import Launcher, { toggleLauncher } from "./widget/launcher/Launcher"
import Osd, { showBrightness } from "./widget/osd/Osd"
import Wallpapers, { toggleWallpapers } from "./widget/wallpapers/Wallpapers"
import Files, { toggleFiles } from "./widget/files/Files"
import Screenshot, { ShotPreview, screenshotRegion, screenshotFull } from "./widget/screenshot/Screenshot"
import Clipboard, { toggleClipboard } from "./widget/clipboard/Clipboard"
import Overview, { toggleOverview } from "./widget/overview/Overview"
import { toggleDateMenu } from "./widget/bar/modules/DateMenu"
import Desktop, { toggleEditWidgets } from "./widget/desktop/Desktop"

app.start({
  css: style,
  requestHandler(argv, response) {
    if (argv[0] === "toggle-launcher") {
      toggleLauncher()
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
    if (argv[0] === "toggle-clipboard") { toggleClipboard(); return response("ok") }
    if (argv[0] === "toggle-overview") { toggleOverview(); return response("ok") }
    if (argv[0] === "toggle-datemenu") { toggleDateMenu(); return response("ok") }
    if (argv[0] === "toggle-widgets") { toggleEditWidgets(); return response("ok") }
    response("unknown request")
  },
  main() {
    Desktop()
    app.get_monitors().map(Bar)
    Toasts()
    Launcher()
    Osd()
    Wallpapers()
    Files()
    Screenshot()
    ShotPreview()
    Clipboard()
    Overview()
  },
})

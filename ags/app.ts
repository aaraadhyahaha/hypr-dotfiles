import app from "ags/gtk4/app"
import style from "./style.scss"
import Bar from "./widget/Bar"
import Toasts from "./widget/Toasts"
import Launcher, { toggleLauncher } from "./widget/Launcher"
import Osd, { showBrightness } from "./widget/Osd"
import Wallpapers, { toggleWallpapers } from "./widget/Wallpapers"
import Files, { toggleFiles } from "./widget/Files"
import Screenshot, { ShotPreview, screenshotRegion, screenshotFull } from "./widget/Screenshot"
import Clipboard, { toggleClipboard } from "./widget/Clipboard"
import { initPresets, setPreset } from "./service/presets"

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
    if (argv[0] === "preset") { setPreset(argv[1]); return response("ok") }
    response("unknown request")
  },
  main() {
    initPresets()
    app.get_monitors().map(Bar)
    Toasts()
    Launcher()
    Osd()
    Wallpapers()
    Files()
    Screenshot()
    ShotPreview()
    Clipboard()
  },
})

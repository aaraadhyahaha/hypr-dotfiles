import GLib from "gi://GLib"
import { createState } from "ags"
import { readFile } from "ags/file"
import { execAsync } from "ags/process"

export const MODE_FILE = `${GLib.get_home_dir()}/.cache/theme_mode`
export const IDX_FILE = `${GLib.get_home_dir()}/.cache/theme_idx`
export const WALL_FILE = `${GLib.get_home_dir()}/.cache/last_wall`

export const readFileOr = (path: string, fallback: string) => {
  try {
    return readFile(path).trim()
  } catch (e) {
    return fallback
  }
}

export const [themeMode, setThemeMode] = createState(readFileOr(MODE_FILE, "dark"))
export const [themeIdx, setThemeIdx] = createState(Number(readFileOr(IDX_FILE, "0")) || 0)

// write the mode, then let theme-apply.sh regenerate colours for every app
export function setTheme(mode: "dark" | "light") {
  setThemeMode(mode)
  execAsync(["sh", "-c", `echo ${mode} > ${MODE_FILE} && ~/.config/hypr/scripts/theme-apply.sh`]).catch(console.error)
}

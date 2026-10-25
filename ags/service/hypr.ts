import { execAsync } from "ags/process"

// Hyprland >= 0.55 replaced `hyprctl dispatch workspace 2` with Lua expressions
// (`hl.dsp.focus({ workspace = "2" })`), and AstalHyprland's dispatch()/focus()/kill()
// still use the old syntax, so they silently do nothing. Try the Lua form first and
// fall back to the legacy form for older Hyprland. Success prints "ok".
export async function hyprDispatch(lua: string, legacy: string[]) {
  try {
    const out = await execAsync(["hyprctl", "dispatch", lua])
    if (out.trim() === "ok") return
  } catch {}
  try {
    await execAsync(["hyprctl", "dispatch", ...legacy])
  } catch {}
}

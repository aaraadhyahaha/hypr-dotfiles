import app from "ags/gtk4/app"

// top margin for the search-style cards (launcher, files, clipboard): pinned from the top
// rather than centred, so the field holds still while the results change height
export function surfaceTop() {
  const h = app.get_monitors()[0]?.get_geometry().height ?? 900
  return Math.round(h * 0.16)
}

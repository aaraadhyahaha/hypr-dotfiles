import { createState } from "ags"
import { Gdk, Gtk } from "ags/gtk4"
import { readFile, writeFile } from "ags/file"
import GLib from "gi://GLib"

export interface Preset {
  id: string
  label: string
  gapX: number
  gapY: number
  barPad: number
  barHeight: number
  barRadius: number
  radius: number
  cardRadius: number
  innerRadius: number
}

export const PRESETS: Preset[] = [
  { id: "classic", label: "Classic", gapX: 8, gapY: 6, barPad: 3, barHeight: 32,
    barRadius: 10, radius: 10, cardRadius: 14, innerRadius: 8 },
  { id: "snappy", label: "Snappy", gapX: 0, gapY: 0, barPad: 2, barHeight: 28,
    barRadius: 0, radius: 6, cardRadius: 8, innerRadius: 5 },
]

const FILE = `${GLib.get_home_dir()}/.cache/ags_preset`
const find = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0]

const saved = () => {
  try {
    return readFile(FILE).trim()
  } catch {
    return "classic"
  }
}

const [presetId, _setId] = createState(find(saved()).id)
export { presetId }

const css = (p: Preset) => `
.body {
  margin: ${p.gapY}px ${p.gapX}px 0 ${p.gapX}px;
  padding: ${p.barPad}px;
  min-height: ${p.barHeight}px;
  border-radius: ${p.barRadius}px;
}
.qs {
  margin: ${p.gapY}px ${p.gapX}px 0 0;
}
popover > contents, .toast, .osd-card, .qs {
  border-radius: ${p.radius}px;
}
.card, .wp-card {
  border-radius: ${p.cardRadius}px;
}
.hero {
  border-radius: ${Math.max(p.cardRadius - 4, 0)}px;
}
.row, .menu-item, .notif, popover modelbutton,
.hoverable, button.launcher, button.icon-btn,
menubutton.power button, .tray menubutton button {
  border-radius: ${p.innerRadius}px;
}
`

let provider: Gtk.CssProvider | null = null

function apply(p: Preset) {
  if (!provider) {
    provider = new Gtk.CssProvider()
    Gtk.StyleContext.add_provider_for_display(
      Gdk.Display.get_default()!,
      provider,
      Gtk.STYLE_PROVIDER_PRIORITY_USER + 2,
    )
  }
  provider.load_from_string(css(p))
}

export function initPresets() {
  apply(find(presetId.get()))
}

export function setPreset(id: string) {
  const p = find(id)
  _setId(p.id)
  apply(p)
  try {
    writeFile(FILE, p.id)
  } catch {}
}
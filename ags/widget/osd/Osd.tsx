import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { timeout } from "ags/time"
import { enter, exit, exiting, MOTION } from "../common/motion"
import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import AstalWp from "gi://AstalWp"

const G = { mute: "\uf6a9", low: "\uf027", high: "\uf028", sun: "\uf185" }

let showBrightnessFn = () => {}
export const showBrightness = () => showBrightnessFn()

export default function Osd() {
  let win: Astal.Window
  let card: Gtk.Box
  let icon: Gtk.Label
  let pct: Gtk.Label
  let bar: Gtk.ProgressBar

  let hideTimer: { cancel: () => void } | null = null
  let ready = false
  timeout(1500, () => (ready = true)) // ignore startup noise

  // smooth bar tween, synced to the frame clock
  let cur = 0, from = 0, to = 0, t0 = 0, ticking = false
  const animateTo = (v: number) => {
    from = cur; to = v; t0 = GLib.get_monotonic_time()
    if (ticking) return
    ticking = true
    bar.add_tick_callback(() => {
      const p = Math.min(1, (GLib.get_monotonic_time() - t0) / (MOTION.base * 1000))
      const e = 1 - Math.pow(1 - p, 3)
      cur = from + (to - from) * e
      bar.fraction = cur
      if (p >= 1) { ticking = false; return GLib.SOURCE_REMOVE }
      return GLib.SOURCE_CONTINUE
    })
  }

  const hide = () => exit(card, () => (win.visible = false))

  const show = (glyph: string, value: number, dim = false) => {
    value = Math.max(0, Math.min(1, value))
    icon.label = glyph
    pct.label = `${Math.round(value * 100)}%`
    dim ? card.add_css_class("dim") : card.remove_css_class("dim")

    hideTimer?.cancel()
    if (!win.visible || exiting(card)) {
      cur = value
      bar.fraction = value // appear at the right value, no sweep from the old one
      win.visible = true
      enter(card)
    } else {
      animateTo(value)
    }
    hideTimer = timeout(1600, hide)
  }

  // Volume: react to any change
  const speaker = AstalWp.get_default()?.audio.defaultSpeaker
  if (speaker) {
    const onVol = () => {
      if (!ready) return
      const glyph = speaker.mute ? G.mute : speaker.volume < 0.4 ? G.low : G.high
      show(glyph, speaker.volume, speaker.mute)
    }
    speaker.connect("notify::volume", onVol)
    speaker.connect("notify::mute", onVol)
  }

  // Brightness: called via `ags request osd-brightness`
  showBrightnessFn = () => {
    execAsync(["sh", "-c", "brightnessctl -m | cut -d, -f4 | tr -d %"])
      .then((out) => show(G.sun, parseInt(out.trim()) / 100))
      .catch(console.error)
  }

  return (
    <window
      $={(self) => (win = self)}
      visible={false}
      name="osd"
      namespace="osd"
      class="Osd"
      layer={Astal.Layer.OVERLAY}
      anchor={Astal.WindowAnchor.BOTTOM}
      exclusivity={Astal.Exclusivity.IGNORE}
      application={app}
    >
      <box $={(self) => (card = self)} class="osd-card">
        <label $={(self) => (icon = self)} class="osd-icon" />
        <Gtk.ProgressBar $={(self) => (bar = self)} class="osd-bar" hexpand valign={Gtk.Align.CENTER} />
        <label $={(self) => (pct = self)} class="osd-pct" widthChars={4} xalign={1} />
      </box>
    </window>
  )
}
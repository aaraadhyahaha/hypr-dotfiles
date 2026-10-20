import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { timeout } from "ags/time"
import { Motion, ENTER, MOTION, EASE } from "../common/motion"
import { execAsync } from "ags/process"
import { readFile } from "ags/file"
import GLib from "gi://GLib"
import AstalWp from "gi://AstalWp"
import { ledEvents, type Leds } from "./model"

const G = {
  mute: "\uf6a9", low: "\uf027", high: "\uf028", sun: "\uf185",
  mic: "\uf130", micOff: "\uf131", lock: "\uf023", unlock: "\uf09c", kbd: "\uf11c",
}

// first /sys/class/leds/<name> whose name ends with `suffix`, or null on machines without one
function ledDir(suffix: string): string | null {
  try {
    const dir = GLib.Dir.open("/sys/class/leds", 0)
    for (let name = dir.read_name(); name; name = dir.read_name())
      if (name.endsWith(suffix)) return `/sys/class/leds/${name}`
  } catch {}
  return null
}

const readInt = (path: string | null) => {
  if (!path) return null
  try { return parseInt(readFile(path).trim()) } catch { return null }
}

let showBrightnessFn = () => {}
export const showBrightness = () => showBrightnessFn()

export default function Osd() {
  let win: Astal.Window
  let card: Gtk.Box
  let motion: Motion
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
    // frame times share the monotonic clock, and land on actual frame boundaries
    bar.add_tick_callback((_w, clock) => {
      const p = Math.min(1, Math.max(0, clock.get_frame_time() - t0) / (MOTION.base * 1000))
      const e = EASE.out(p)
      cur = from + (to - from) * e
      bar.fraction = cur
      if (p >= 1) { ticking = false; return GLib.SOURCE_REMOVE }
      return GLib.SOURCE_CONTINUE
    })
  }

  // instant; Hyprland fades the last frame out
  const hide = () => (win.visible = false)

  const show = (glyph: string, value: number, dim = false) => {
    value = Math.max(0, Math.min(1, value))
    icon.label = glyph
    pct.label = `${Math.round(value * 100)}%`
    dim ? card.add_css_class("dim") : card.remove_css_class("dim")
    bar.visible = true
    pct.xalign = 1
    pct.hexpand = false
    card.remove_css_class("text")
    present(value)
  }

  // a message instead of a level: mic muted, caps lock, output device
  const showText = (glyph: string, text: string) => {
    icon.label = glyph
    pct.label = text
    card.remove_css_class("dim")
    bar.visible = false
    pct.xalign = 0
    pct.hexpand = true
    card.add_css_class("text")
    present(null)
  }

  const present = (value: number | null) => {
    hideTimer?.cancel()
    if (!win.visible) {
      if (value !== null) {
        cur = value
        bar.fraction = value // appear at the right value, no sweep from the old one
      }
      motion.animate(ENTER.rise)
      win.visible = true
    } else if (value !== null) {
      animateTo(value)
    }
    hideTimer = timeout(1600, hide)
  }

  // Volume: react to any change
  const speaker = AstalWp.get_default()?.audio.defaultSpeaker
  let deviceSwitchedAt = 0
  if (speaker) {
    const onVol = () => {
      // a device switch also changes volume; keep the device name on screen
      if (!ready || Date.now() - deviceSwitchedAt < MOTION.base) return
      const glyph = speaker.mute ? G.mute : speaker.volume < 0.4 ? G.low : G.high
      show(glyph, speaker.volume, speaker.mute)
    }
    speaker.connect("notify::volume", onVol)
    speaker.connect("notify::mute", onVol)
    speaker.connect("notify::description", () => {
      if (!ready || !speaker.description) return
      deviceSwitchedAt = Date.now()
      showText(G.high, speaker.description)
    })
  }

  // Mic: the mute key, or anything else that mutes it
  const mic = AstalWp.get_default()?.audio.defaultMicrophone
  mic?.connect("notify::mute", () => {
    if (ready) showText(mic.mute ? G.micOff : G.mic, mic.mute ? "Mic muted" : "Mic on")
  })

  // Caps Lock and keyboard backlight change outside any app's view, so poll the LEDs.
  // These are sysfs reads, not processes.
  const caps = ledDir("::capslock")
  const kbd = ledDir("::kbd_backlight")
  const readLeds = (): Leds => ({
    caps: caps ? readInt(`${caps}/brightness`) === 1 : null,
    kbd: readInt(kbd && `${kbd}/brightness`),
    kbdMax: readInt(kbd && `${kbd}/max_brightness`),
  })
  if (caps || kbd) {
    let leds = readLeds()
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
      const next = readLeds()
      if (ready)
        for (const e of ledEvents(leds, next))
          e.kind === "caps"
            ? showText(e.on ? G.lock : G.unlock, e.on ? "Caps Lock on" : "Caps Lock off")
            : show(G.kbd, e.value)
      leds = next
      return GLib.SOURCE_CONTINUE
    })
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
      <Motion $={(self) => (motion = self)}>
        <box $={(self) => (card = self)} class="osd-card">
          <label $={(self) => (icon = self)} class="osd-icon" />
          <Gtk.ProgressBar $={(self) => (bar = self)} class="osd-bar" hexpand valign={Gtk.Align.CENTER} />
          <label $={(self) => (pct = self)} class="osd-pct" widthChars={4} xalign={1} />
        </box>
      </Motion>
    </window>
  )
}
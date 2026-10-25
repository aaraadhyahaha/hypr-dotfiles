import GLib from "gi://GLib"
import AstalWp from "gi://AstalWp?version=0.1"
import AstalNetwork from "gi://AstalNetwork?version=0.1"
import AstalBluetooth from "gi://AstalBluetooth?version=0.1"
import AstalNotifd from "gi://AstalNotifd?version=0.1"
import AstalMpris from "gi://AstalMpris"
import { timeout } from "ags/time"
import { type Intent, type ToggleTarget } from "./actionsModel"
import { type Item } from "./model"
import { pickPlayer } from "../media/model"
import { LAYER_GONE } from "../common/motion"
import { pomodoro } from "../../service/pomodoro"
import { timers, addTimer, cancelTimer } from "../../service/timer"
import { fmtSpan, fmtLeft, fmtClock } from "../../service/timerModel"
import { recording, toggleRecording } from "../../service/recorder"
import { themeMode, setTheme } from "../bar/quicksettings/theme"
import { nightOn, setNight, checkNight, NIGHT_K, planeOn, setPlane, checkPlane } from "../bar/quicksettings/cc"
import { readBrightness, setBrightness } from "../bar/quicksettings/Sliders"
import { caffeineOn, setCaffeine } from "../bar/modules/Caffeine"
import { POWER, runPower } from "../bar/modules/Power"
import { showBrightness } from "../osd/Osd"
import { toggleShotMenu } from "../screenshot/ShotMenu"
import { screenshotRegion } from "../screenshot/Screenshot"

// Launcher quick actions: each parsed intent (actionsModel.ts) becomes result rows that
// call the same helpers the bar and Control Center use. Rows name the outcome before
// Enter ("Set volume to 30%", "ends 14:32"); a missing tool or device hides the row.

const has = (bin: string) => GLib.find_program_in_path(bin) !== null
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const onOff = (on: boolean) => (on ? "on" : "off")

// state only readable by shelling out, refreshed each time the launcher opens so rows
// can be built synchronously; null = no backlight, undefined = not read yet
let brightness: number | null | undefined
let awake: boolean | undefined

export function refreshActions() {
  readBrightness().then((n) => (brightness = n))
  if (has("hypridle")) caffeineOn().then((a) => (awake = a))
  checkNight()
  checkPlane()
}

// the launcher hides first; wait out its fade so it isn't in the capture
const afterHide = (fn: () => void) => timeout(LAYER_GONE, fn)

function toggleItem(label: string, symbol: string, cur: boolean | undefined, want: boolean | undefined, set: (on: boolean) => unknown): Item {
  // state unknown: `set` reads it itself and flips it (its argument is ignored)
  if (cur === undefined && want === undefined) {
    return { name: `Toggle ${label}`, symbol, hint: "Toggle", launch: () => set(true) }
  }
  const next = want ?? !cur
  return {
    name: `Turn ${label} ${onOff(next)}`,
    description: cur === undefined ? null : cur === next ? `Already ${onOff(cur)}` : `${label} is ${onOff(cur!)}`,
    symbol,
    hint: `Turn ${onOff(next)}`,
    launch: () => set(next),
  }
}

function toggleItems(target: ToggleTarget, want?: boolean): Item[] {
  switch (target) {
    case "wifi": {
      const wifi = AstalNetwork.get_default().wifi
      if (!wifi) return []
      return [toggleItem("Wi-Fi", "wifi", wifi.enabled, want, (on) => (wifi.enabled = on))]
    }
    case "bt": {
      const bt = AstalBluetooth.get_default()
      const adapter = bt.adapter
      if (!adapter) return []
      return [toggleItem("Bluetooth", "bluetooth", bt.isPowered, want, (on) => (adapter.powered = on))]
    }
    case "dnd": {
      const notifd = AstalNotifd.get_default()
      return [toggleItem("Do Not Disturb", "do_not_disturb_on", notifd.dontDisturb, want, (on) => (notifd.dontDisturb = on))]
    }
    case "nightlight": {
      if (!has("hyprsunset")) return []
      const it = toggleItem("Night Light", "nightlight", nightOn.get(), want, setNight)
      if (!nightOn.get()) it.description = `Warm the screen to ${NIGHT_K} K`
      return [it]
    }
    case "airplane":
      if (!has("rfkill")) return []
      return [toggleItem("Airplane mode", "flight", planeOn.get(), want, setPlane)]
    case "caffeine": {
      if (!has("hypridle")) return []
      // with no explicit on/off and an unknown state, read it at Enter time
      const set = want === undefined && awake === undefined ? () => caffeineOn().then((a) => setCaffeine(!a)) : setCaffeine
      const it = toggleItem("Caffeine", "coffee", awake, want, set)
      if (!awake) it.description = "Keep the screen awake"
      return [it]
    }
  }
}

function volumeItems(value: number, relative: boolean): Item[] {
  const speaker = AstalWp.get_default()?.audio.defaultSpeaker
  if (!speaker) return []
  const now = clamp(speaker.volume * 100)
  const target = clamp(relative ? now + value : value)
  return [{
    name: relative ? `Volume ${value >= 0 ? "up" : "down"} to ${target}%` : `Set volume to ${target}%`,
    description: `Now ${now}%${speaker.mute ? " · muted" : ""}`,
    symbol: target === 0 ? "volume_off" : target < 40 ? "volume_down" : "volume_up",
    level: target / 100,
    hint: "Set",
    launch: () => {
      speaker.volume = target / 100
      if (speaker.mute && target > 0) speaker.mute = false
    },
  }]
}

function brightnessItems(value: number, relative: boolean): Item[] {
  if (brightness === null) return []
  const known = brightness !== undefined
  const target = known ? Math.max(1, clamp(relative ? brightness! + value : value)) : value
  const set = (pct: number) => setBrightness(pct).then(() => showBrightness())
  return [{
    name: relative && !known
      ? `Brightness ${value >= 0 ? "up" : "down"} ${Math.abs(value)}%`
      : `${relative ? `Brightness ${value >= 0 ? "up" : "down"} to` : "Set brightness to"} ${target}%`,
    description: known ? `Now ${brightness}%` : null,
    symbol: "light_mode",
    level: known || !relative ? target / 100 : undefined,
    hint: "Set",
    // a relative change re-reads the level so a stale cache can't overshoot
    launch: () =>
      relative
        ? readBrightness().then((n) => { if (n !== null) set(Math.max(1, clamp(n + value))) })
        : set(target),
  }]
}

function muteItems(target: "speaker" | "mic", want?: boolean): Item[] {
  const audio = AstalWp.get_default()?.audio
  const ep = target === "speaker" ? audio?.defaultSpeaker : audio?.defaultMicrophone
  if (!ep) return []
  const muted = ep.mute
  const next = want ?? !muted
  const what = target === "speaker" ? "sound" : "microphone"
  return [{
    name: `${next ? "Mute" : "Unmute"} ${what}`,
    description: muted === next ? `Already ${next ? "muted" : "unmuted"}` : target === "speaker" ? `Volume ${clamp(ep.volume * 100)}%` : null,
    symbol: target === "speaker" ? (next ? "volume_off" : "volume_up") : next ? "mic_off" : "mic",
    hint: next ? "Mute" : "Unmute",
    launch: () => (ep.mute = next),
  }]
}

function themeItems(mode: "dark" | "light"): Item[] {
  // anything but "light" counts as dark, as theme-apply.sh does
  const cur = themeMode.get() === "light" ? "light" : "dark"
  return [{
    name: `${mode === "dark" ? "Dark" : "Light"} theme`,
    description: cur === mode ? "Already on · Enter re-applies it" : `Switch from ${cur}`,
    symbol: mode === "dark" ? "dark_mode" : "light_mode",
    hint: "Apply",
    launch: () => setTheme(mode),
  }]
}

const POWER_DESC: Record<keyof typeof POWER, string> = {
  lock: "Lock the screen",
  suspend: "Sleep now",
  logout: "End the Hyprland session",
  reboot: "Restart the computer",
  shutdown: "Power off the computer",
}

function powerItems(op: keyof typeof POWER): Item[] {
  const p = POWER[op]
  return [{ name: p.text, description: POWER_DESC[op], symbol: p.icon, hint: p.text, launch: () => runPower(op) }]
}

const MEDIA = {
  play: { name: "Play", symbol: "play_arrow", can: (p: AstalMpris.Player) => p.canPlay, run: (p: AstalMpris.Player) => p.play() },
  pause: { name: "Pause", symbol: "pause", can: (p: AstalMpris.Player) => p.canPause, run: (p: AstalMpris.Player) => p.pause() },
  next: { name: "Next track", symbol: "skip_next", can: (p: AstalMpris.Player) => p.canGoNext, run: (p: AstalMpris.Player) => p.next() },
  prev: { name: "Previous track", symbol: "skip_previous", can: (p: AstalMpris.Player) => p.canGoPrevious, run: (p: AstalMpris.Player) => p.previous() },
}

function mediaItems(op: keyof typeof MEDIA): Item[] {
  const player = pickPlayer(AstalMpris.get_default().players)
  const m = MEDIA[op]
  if (!player || !m.can(player)) return []
  const track = [player.title, player.artist].filter(Boolean).join(" — ")
  return [{
    name: m.name,
    description: track ? `${player.identity} · ${track}` : player.identity,
    symbol: m.symbol,
    hint: m.name,
    launch: () => m.run(player),
  }]
}

function timerItems(): Item[] {
  const list = timers.get()
  if (!list.length) {
    return [{ name: "No timers running", description: "Start one with “timer 10m tea”", symbol: "timer_off" }]
  }
  const now = Date.now()
  return list.map((t) => ({
    name: t.label ? `${t.label} · ${fmtSpan(t.secs)}` : `${fmtSpan(t.secs)} timer`,
    description: `${fmtLeft((t.endWall - now) / 1000)} left · ends ${fmtClock(t.endWall)}`,
    symbol: "timer",
    hint: "Cancel",
    launch: () => cancelTimer(t.id),
  }))
}

const PHASE = { focus: "Focus", short: "Short break", long: "Long break" }

function pomoItems(op: "start" | "pause" | "toggle", mins?: number, task?: string): Item[] {
  const s = pomodoro.state
  const left = `${fmtLeft(s.remaining)} left`
  const phase = PHASE[s.phase]

  if (op === "start" && mins) {
    const ends = fmtClock(Date.now() + mins * 60_000)
    return [{
      name: `Focus for ${fmtSpan(mins * 60)}`,
      description: [task, `ends ${ends}`, s.running && `replaces the running ${phase.toLowerCase()}`].filter(Boolean).join(" · "),
      symbol: "timer_play",
      hint: "Start",
      launch: () => pomodoro.startFocus(mins, task),
    }]
  }
  if (op === "pause" || (op === "toggle" && s.running)) {
    if (!s.running) return [{ name: "Pomodoro isn't running", description: `${phase} · ${left}`, symbol: "timer_pause" }]
    return [{ name: `Pause ${phase.toLowerCase()}`, description: [s.task, left].filter(Boolean).join(" · "), symbol: "pause", hint: "Pause", launch: () => pomodoro.pause() }]
  }
  // "focus" (start) or "pomo" (toggle) while stopped
  if (op === "start" && s.running) {
    return [{ name: `${phase} running`, description: [s.task, left].filter(Boolean).join(" · "), symbol: "timer" }]
  }
  const fresh = s.remaining === s.total
  if (op === "start" && s.phase !== "focus") {
    return [{ name: "Start focus", description: `${fmtSpan(pomodoro.settings.focus * 60)} · skips the ${phase.toLowerCase()}`, symbol: "play_arrow", hint: "Start", launch: () => pomodoro.startFocus() }]
  }
  return [{
    name: `${fresh ? "Start" : "Resume"} ${phase.toLowerCase()}`,
    description: [s.task, fresh ? fmtSpan(s.total) : left].filter(Boolean).join(" · "),
    symbol: "play_arrow",
    hint: fresh ? "Start" : "Resume",
    launch: () => pomodoro.start(),
  }]
}

export function actionItems(intent: Intent): Item[] {
  switch (intent.kind) {
    case "timer": {
      const ends = fmtClock(Date.now() + intent.secs * 1000)
      return [{
        name: `Start ${fmtSpan(intent.secs)} timer${intent.label ? ` · ${intent.label}` : ""}`,
        description: `ends ${ends}`,
        symbol: "timer",
        hint: "Start",
        launch: () => addTimer(intent.secs, intent.label),
      }]
    }
    case "timers":
      return timerItems()
    case "volume":
      return volumeItems(intent.value, intent.relative)
    case "brightness":
      return brightnessItems(intent.value, intent.relative)
    case "mute":
      return muteItems(intent.target, intent.state)
    case "toggle":
      return toggleItems(intent.target, intent.state)
    case "theme":
      return themeItems(intent.mode)
    case "power":
      return powerItems(intent.op)
    case "media":
      return mediaItems(intent.op)
    case "screenshot":
      return [{
        name: "Screenshot",
        description: "Shift+Enter: capture a region now",
        symbol: "screenshot_region",
        hint: "Open",
        launch: () => toggleShotMenu(),
        alt: () => afterHide(screenshotRegion),
      }]
    case "record": {
      if (!has("wf-recorder")) return []
      const on = recording.get()
      return [{
        name: on ? "Stop recording" : "Record screen",
        description: on ? "Saves to ~/Videos/Recordings" : "Whole screen, no audio",
        symbol: on ? "stop_circle" : "radio_button_checked",
        hint: on ? "Stop" : "Record",
        launch: () => (on ? toggleRecording() : afterHide(toggleRecording)),
      }]
    }
    case "pomo":
      return pomoItems(intent.op, intent.mins, intent.task)
  }
}

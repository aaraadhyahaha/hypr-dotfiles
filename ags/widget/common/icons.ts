import { createBinding, createComputed } from "ags"
import AstalNetwork from "gi://AstalNetwork?version=0.1"
import AstalBluetooth from "gi://AstalBluetooth?version=0.1"
import AstalWp from "gi://AstalWp?version=0.1"

// Material Symbols names for live state, shared by the bar and the Control Center

export function wifiIcon(wifi: AstalNetwork.Wifi) {
  const enabled = createBinding(wifi, "enabled")
  const ssid = createBinding(wifi, "ssid")
  const strength = createBinding(wifi, "strength")
  return createComputed(() => {
    if (!enabled()) return "wifi_off"
    if (!ssid()) return "signal_wifi_0_bar"
    const s = strength()
    return s > 66 ? "wifi" : s > 33 ? "wifi_2_bar" : "wifi_1_bar"
  })
}

export function btIcon(bt: AstalBluetooth.Bluetooth) {
  const powered = createBinding(bt, "isPowered")
  const connected = createBinding(bt, "isConnected")
  return createComputed(() =>
    !powered() ? "bluetooth_disabled" : connected() ? "bluetooth_connected" : "bluetooth",
  )
}

export function volumeIcon(speaker: AstalWp.Endpoint) {
  const mute = createBinding(speaker, "mute")
  const volume = createBinding(speaker, "volume")
  return createComputed(() => {
    const v = volume()
    if (mute()) return "volume_off"
    return v === 0 ? "volume_mute" : v < 0.5 ? "volume_down" : "volume_up"
  })
}

const CHARGING = [20, 30, 50, 60, 80, 90]

// 0–6 bars, or the nearest charging step at or below the level
export function batteryIcon(p: number, charging: boolean) {
  const pct = Math.round(p * 100)
  if (charging) {
    if (pct >= 95) return "battery_charging_full"
    const step = [...CHARGING].reverse().find((s) => pct >= s) ?? 20
    return `battery_charging_${step}`
  }
  if (pct >= 95) return "battery_full"
  return `battery_${Math.min(6, Math.floor(pct / 14))}_bar`
}

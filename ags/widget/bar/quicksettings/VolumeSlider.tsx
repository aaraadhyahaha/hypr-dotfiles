import { createBinding } from "ags"
import AstalWp from "gi://AstalWp?version=0.1"
import Slider from "./Slider"

export default function VolumeSlider() {
  const speaker = AstalWp.get_default()!.audio.defaultSpeaker
  return (
    <Slider
      icon={createBinding(speaker, "volumeIcon")}
      value={createBinding(speaker, "volume")}
      onChange={(v) => (speaker.volume = v)}
    />
  )
}

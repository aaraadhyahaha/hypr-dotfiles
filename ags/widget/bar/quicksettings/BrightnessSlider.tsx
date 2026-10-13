import { createPoll } from "ags/time"
import { execAsync } from "ags/process"
import Slider from "./Slider"

export default function BrightnessSlider() {
  const level = createPoll(
    0.5, 1500,
    ["sh", "-c", "brightnessctl -m | cut -d, -f4 | tr -d %"],
    (out) => Number(out) / 100,
  )
  return (
    <Slider
      icon="display-brightness-symbolic"
      value={level}
      onChange={(v) =>
        execAsync(["brightnessctl", "set", `${Math.max(1, Math.round(v * 100))}%`])
      }
    />
  )
}

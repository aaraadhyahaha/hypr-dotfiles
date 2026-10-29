import Icon from "../../common/Icon"
import { openShot } from "../../screenshot/Screenshot"

// Opens the screenshot session (or stops a running recording: openShot() handles both)
export default function ScreenshotBtn() {
  return (
    <button class="icon-btn shot-btn" tooltipText="Screenshot" onClicked={() => openShot()}>
      <Icon name="screenshot_region" class="lg" />
    </button>
  )
}

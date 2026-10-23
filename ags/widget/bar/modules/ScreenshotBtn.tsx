import { screenshotRegion } from "../../screenshot/Screenshot"
import Icon from "../../common/Icon"

// Opens the region picker; the screenshot toolbar (phase 5) will replace this action.
export default function ScreenshotBtn() {
  return (
    <button class="icon-btn" tooltipText="Screenshot" onClicked={() => screenshotRegion()}>
      <Icon name="screenshot_region" class="lg" />
    </button>
  )
}

import { screenshotRegion } from "../../screenshot/Screenshot"

// Opens the region picker; the screenshot toolbar (phase 5) will replace this action.
export default function ScreenshotBtn() {
  return (
    <button class="icon-btn" tooltipText="Screenshot" onClicked={() => screenshotRegion()}>
      <label class="glyph" label={""} />
    </button>
  )
}
